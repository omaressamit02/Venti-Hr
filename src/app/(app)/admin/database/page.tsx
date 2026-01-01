
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useDb } from '@/firebase';
import { ref, get, remove, set } from 'firebase/database';
import { format, subMonths } from 'date-fns';
import { Trash2, AlertTriangle, Download, DatabaseZap, Upload, Archive } from 'lucide-react';
import { saveAs } from 'file-saver';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';


export default function DatabaseManagementPage() {
  const { toast } = useToast();
  const db = useDb();
  const [selectedMonth, setSelectedMonth] = useState<string>(
    format(subMonths(new Date(), 1), 'yyyy-MM')
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupFile, setBackupFile] = useState<File | null>(null);

  const handleDeleteOldData = async (dataType: 'attendance' | 'payroll' | 'login_logs' | 'visits') => {
    if (!db) {
        toast({ variant: 'destructive', title: 'خطأ في قاعدة البيانات' });
        return;
    }
    setIsDeleting(true);

    const dataTypeName = {
        attendance: 'حضور',
        payroll: 'رواتب',
        login_logs: 'سجلات دخول',
        visits: 'زيارات'
    };

    try {
        const dataRootRef = ref(db, dataType);
        const snapshot = await get(dataRootRef);
        
        if (snapshot.exists()) {
            let pathsToDelete: string[] = [];

            if (dataType === 'login_logs' || dataType === 'attendance' || dataType === 'payroll') {
                // These are keyed by YYYY-MM or similar top-level keys
                const allMonths = Object.keys(snapshot.val());
                pathsToDelete = allMonths.filter(month => month < selectedMonth);
            } else if (dataType === 'visits') {
                 // Visits are nested under employeeId, need to iterate differently
                const allEmployees = snapshot.val();
                let deletedCount = 0;
                 for (const employeeId in allEmployees) {
                     const employeeVisits = allEmployees[employeeId];
                     for (const visitId in employeeVisits) {
                         const visit = employeeVisits[visitId];
                         if (new Date(visit.timestamp) < new Date(selectedMonth)) {
                            await remove(ref(db, `${dataType}/${employeeId}/${visitId}`));
                            deletedCount++;
                         }
                     }
                 }
                 if(deletedCount > 0){
                    toast({
                        title: 'تم الحذف بنجاح',
                        description: `تم حذف ${deletedCount} من سجلات الزيارات قبل الشهر المحدد.`,
                    });
                 } else {
                     toast({
                        title: 'لا توجد بيانات للحذف',
                        description: `لم يتم العثور على سجلات زيارات قبل الشهر المحدد.`,
                    });
                 }
                 setIsDeleting(false);
                 return;
            }

            if (pathsToDelete.length === 0) {
                 toast({
                    title: 'لا توجد بيانات للحذف',
                    description: `لم يتم العثور على سجلات ${dataTypeName[dataType]} قبل الشهر المحدد.`,
                });
                setIsDeleting(false);
                return;
            }

            const removalPromises = pathsToDelete.map(path => remove(ref(db, `${dataType}/${path}`)));
            await Promise.all(removalPromises);

            toast({
                title: 'تم الحذف بنجاح',
                description: `تم حذف بيانات ${dataTypeName[dataType]} لـ ${pathsToDelete.length} شهر.`,
            });

        } else {
             toast({
                title: 'لا توجد بيانات للحذف',
                description: `لم يتم العثور على أي سجلات ${dataTypeName[dataType]}.`,
            });
        }
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'فشل الحذف',
            description: error.message || `حدث خطأ أثناء حذف سجلات ${dataTypeName[dataType]}.`,
        });
    } finally {
        setIsDeleting(false);
    }
  };
  
    const handleBackupData = async () => {
        if (!db) {
            toast({ variant: 'destructive', title: 'خطأ في قاعدة البيانات' });
            return;
        }
        setIsBackingUp(true);
        try {
            const dbRef = ref(db, '/');
            const snapshot = await get(dbRef);
            if (snapshot.exists()) {
                const data = snapshot.val();
                const jsonString = JSON.stringify(data, null, 2);
                const blob = new Blob([jsonString], { type: 'application/json' });
                const backupDate = format(new Date(), 'yyyy-MM-dd');
                saveAs(blob, `database-backup-${backupDate}.json`);
                toast({
                    title: 'تم النسخ الاحتياطي بنجاح',
                    description: 'تم تنزيل ملف النسخة الاحتياطية لقاعدة البيانات.',
                });
            } else {
                toast({ title: 'قاعدة البيانات فارغة', description: 'لا توجد بيانات لإنشاء نسخة احتياطية.' });
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'فشل النسخ الاحتياطي',
                description: error.message || 'حدث خطأ أثناء محاولة أخذ نسخة احتياطية.',
            });
        } finally {
            setIsBackingUp(false);
        }
    };
    
    const handleRestoreData = async () => {
        if (!db || !backupFile) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'الرجاء اختيار ملف نسخة احتياطية أولاً.' });
            return;
        }
        setIsRestoring(true);
        try {
            const fileContent = await backupFile.text();
            const data = JSON.parse(fileContent);

            // This is a destructive action, it will overwrite the entire database.
            await set(ref(db, '/'), data);

            toast({
                title: 'تمت الاستعادة بنجاح',
                description: 'تمت استعادة قاعدة البيانات من النسخة الاحتياطية. قد تحتاج إلى إعادة تحميل الصفحة.',
            });
            setBackupFile(null);
        } catch (error: any) {
             toast({
                variant: 'destructive',
                title: 'فشل الاستعادة',
                description: error.message || 'حدث خطأ أثناء محاولة استعادة البيانات. تأكد من أن الملف صحيح.',
            });
        } finally {
            setIsRestoring(false);
        }
    };


  const months = Array.from({ length: 24 }, (_, i) => {
    return format(subMonths(new Date(), i), 'yyyy-MM');
  });

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-headline font-bold tracking-tight">
        إدارة قاعدة البيانات
      </h2>
      <p className="text-muted-foreground">
        استخدم هذه الصفحة لإدارة بيانات نظامك، أخذ نسخ احتياطية، وحذف السجلات القديمة لتحسين الأداء.
      </p>

      <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2">
                <DatabaseZap className="h-6 w-6" />
                النسخ الاحتياطي والاستعادة
            </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
            <div>
                <CardDescription>
                    يمكنك تنزيل نسخة احتياطية كاملة من قاعدة بياناتك على شكل ملف JSON. احتفظ به في مكان آمن.
                </CardDescription>
                <Button onClick={handleBackupData} disabled={isBackingUp} className="mt-4">
                    <Download className="ml-2 h-4 w-4" />
                    {isBackingUp ? 'جاري التنزيل...' : 'تنزيل نسخة احتياطية'}
                </Button>
            </div>
            <div className="border-t pt-6 space-y-4">
                 <CardDescription>
                    يمكنك استعادة قاعدة البيانات من ملف نسخة احتياطية. <strong className="text-destructive">تحذير: هذه العملية ستقوم بمسح جميع البيانات الحالية واستبدالها ببيانات النسخة الاحتياطية.</strong>
                </CardDescription>
                <div className="space-y-2 max-w-sm">
                    <Label htmlFor="backup-file">اختر ملف النسخة الاحتياطية (.json)</Label>
                    <Input id="backup-file" type="file" accept=".json" onChange={(e) => setBackupFile(e.target.files ? e.target.files[0] : null)} />
                </div>
                 <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" disabled={!backupFile || isRestoring}>
                            <Upload className="ml-2 h-4 w-4" />
                            {isRestoring ? 'جاري الاستعادة...' : 'استعادة البيانات الآن'}
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>تأكيد نهائي لعملية الاستعادة</AlertDialogTitle>
                            <AlertDialogDescription>
                                هل أنت متأكد تمامًا من رغبتك في المتابعة؟ سيتم حذف <strong className="text-destructive">جميع</strong> البيانات الحالية في قاعدة البيانات بشكل نهائي واستبدالها بالبيانات الموجودة في الملف الذي اخترته. لا يمكن التراجع عن هذا الإجراء إطلاقًا.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>إلغاء</AlertDialogCancel>
                            <AlertDialogAction onClick={handleRestoreData} className="bg-destructive hover:bg-destructive/90">نعم، أفهم الخطر وأريد المتابعة</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </CardContent>
      </Card>

      <Card>
         <CardHeader>
             <CardTitle className="flex items-center gap-2">
                <Archive className="h-6 w-6 text-primary" />
                أرشفة وحذف السجلات القديمة
            </CardTitle>
            <CardDescription>
                سيتم حذف جميع السجلات في الشهور التي تأتي **قبل** الشهر الذي تختاره بشكل نهائي. لا يمكن التراجع عن هذا الإجراء.
            </CardDescription>
         </CardHeader>
         <CardContent className="space-y-4">
            <div className="space-y-2 max-w-sm">
                <label className="text-sm font-medium">حذف جميع البيانات قبل شهر:</label>
                <Select
                    dir="rtl"
                    value={selectedMonth}
                    onValueChange={setSelectedMonth}
                >
                    <SelectTrigger>
                    <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                    {months.map((month) => (
                        <SelectItem key={month} value={month}>
                        {new Date(month + '-02').toLocaleDateString('ar', {
                            month: 'long',
                            year: 'numeric',
                        })}
                        </SelectItem>
                    ))}
                    </SelectContent>
                </Select>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 pt-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">سجلات الحضور</CardTitle>
                        <CardDescription>حذف سجلات الحضور والانصراف القديمة.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" className="w-full" disabled={isDeleting}>
                                    <Trash2 className="ml-2 h-4 w-4" />
                                    {isDeleting ? 'جاري الحذف...' : 'حذف سجلات الحضور'}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
                                <AlertDialogDescription>
                                    سيتم حذف جميع سجلات الحضور قبل شهر {new Date(selectedMonth + '-02').toLocaleDateString('ar', { month: 'long', year: 'numeric' })}.
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteOldData('attendance')} className="bg-destructive hover:bg-destructive/90">تأكيد الحذف</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </CardContent>
                </Card>

                 <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">سجلات الرواتب</CardTitle>
                        <CardDescription>حذف سجلات الرواتب المدفوعة القديمة.</CardDescription>
                    </CardHeader>
                    <CardContent>
                       <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" className="w-full" disabled={isDeleting}>
                                    <Trash2 className="ml-2 h-4 w-4" />
                                     {isDeleting ? 'جاري الحذف...' : 'حذف سجلات الرواتب'}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
                                <AlertDialogDescription>
                                    سيتم حذف جميع سجلات الرواتب النهائية قبل شهر {new Date(selectedMonth + '-02').toLocaleDateString('ar', { month: 'long', year: 'numeric' })}.
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteOldData('payroll')} className="bg-destructive hover:bg-destructive/90">تأكيد الحذف</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">سجلات الدخول</CardTitle>
                        <CardDescription>حذف سجلات محاولات الدخول القديمة.</CardDescription>
                    </CardHeader>
                    <CardContent>
                       <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" className="w-full" disabled={isDeleting}>
                                    <Trash2 className="ml-2 h-4 w-4" />
                                     {isDeleting ? 'جاري الحذف...' : 'حذف سجلات الدخول'}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
                                <AlertDialogDescription>
                                     سيتم حذف جميع سجلات محاولات الدخول قبل شهر {new Date(selectedMonth + '-02').toLocaleDateString('ar', { month: 'long', year: 'numeric' })}.
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteOldData('login_logs')} className="bg-destructive hover:bg-destructive/90">تأكيد الحذف</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </CardContent>
                </Card>

                 <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">سجلات الزيارات</CardTitle>
                        <CardDescription>حذف سجلات الزيارات الميدانية القديمة.</CardDescription>
                    </CardHeader>
                    <CardContent>
                       <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" className="w-full" disabled={isDeleting}>
                                    <Trash2 className="ml-2 h-4 w-4" />
                                     {isDeleting ? 'جاري الحذف...' : 'حذف سجلات الزيارات'}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
                                <AlertDialogDescription>
                                     سيتم حذف جميع سجلات الزيارات قبل شهر {new Date(selectedMonth + '-02').toLocaleDateString('ar', { month: 'long', year: 'numeric' })}.
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteOldData('visits')} className="bg-destructive hover:bg-destructive/90">تأكيد الحذف</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </CardContent>
                </Card>
            </div>
         </CardContent>
      </Card>

    </div>
  );
}

