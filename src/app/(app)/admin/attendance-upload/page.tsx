
'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, set, push, get } from 'firebase/database';
import { Upload, FileQuestion, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Employee {
  id: string;
  employeeCode: string;
  employeeName: string;
  shiftConfiguration?: 'general' | 'custom';
  checkInTime?: string;
  checkOutTime?: string;
}

interface GlobalSettings {
    workStartTime?: string;
}

type Punch = {
  USERID: number | string;
  CHECKTIME: string;
  CHECKTYPE: string;
};

type ConsolidatedRecord = {
    employeeCode: string;
    date: string;
    checkIn: Date | null;
    checkOut: Date | null;
}

type PreviewResult = {
    record: ConsolidatedRecord;
    employeeNameFromSystem?: string;
    validationStatus: 'valid' | 'invalid_code' | 'already_exists';
    message: string;
};


export default function AttendanceUploadPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewResult[]>([]);
  const { toast } = useToast();
  const db = useDb();

  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData, isEmployeesLoading] = useDbData<Record<string, Employee>>(employeesRef);

  const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
  const [settingsData, isSettingsLoading] = useDbData<GlobalSettings>(settingsRef);
  
  const employeesMapByCode = useMemo(() => {
    if (!employeesData) return new Map();
    const map = new Map<string, Employee>();
    Object.entries(employeesData).forEach(([id, emp]) => {
      map.set(emp.employeeCode, { ...emp, id });
    });
    return map;
  }, [employeesData]);


  const processFileContent = async (content: string) => {
    setIsProcessing(true);
    setPreviewData([]);

    if (!db) {
        toast({ variant: 'destructive', title: 'خطأ في قاعدة البيانات' });
        setIsProcessing(false);
        return;
    }

    try {
        const sanitizedContent = content.replace(/:\s*([a-zA-Z_][a-zA-Z0-9_]*)/g, ':"$1"');
        const punches: Punch[] = JSON.parse(sanitizedContent);
        if (!Array.isArray(punches)) {
            throw new Error("ملف JSON غير صالح، يجب أن يحتوي على مصفوفة من السجلات.");
        }

        const punchesByEmployeeDay = new Map<string, Punch[]>();

        for (const punch of punches) {
            const employeeCode = String(punch.USERID);
            const punchDate = new Date(punch.CHECKTIME);
            const dateKey = format(punchDate, "yyyy-MM-dd");
            const mapKey = `${employeeCode}-${dateKey}`;

            if (!punchesByEmployeeDay.has(mapKey)) {
                punchesByEmployeeDay.set(mapKey, []);
            }
            punchesByEmployeeDay.get(mapKey)!.push(punch);
        }
        
        const consolidatedRecords: ConsolidatedRecord[] = [];
        for(const punches of punchesByEmployeeDay.values()){
            const checkIns = punches.filter(p => p.CHECKTYPE.toUpperCase() === 'I').sort((a,b) => new Date(a.CHECKTIME).getTime() - new Date(b.CHECKTIME).getTime());
            const checkOuts = punches.filter(p => p.CHECKTYPE.toUpperCase() === 'O').sort((a,b) => new Date(a.CHECKTIME).getTime() - new Date(b.CHECKTIME).getTime());
            
            const firstCheckIn = checkIns[0];
            const lastCheckOut = checkOuts[checkOuts.length - 1];

            consolidatedRecords.push({
                employeeCode: String(punches[0].USERID),
                date: format(new Date(punches[0].CHECKTIME), "yyyy-MM-dd"),
                checkIn: firstCheckIn ? new Date(firstCheckIn.CHECKTIME) : null,
                checkOut: lastCheckOut ? new Date(lastCheckOut.CHECKTIME) : null,
            });
        }


        const previewResults: PreviewResult[] = [];
        for (const record of consolidatedRecords) {
            const employee = employeesMapByCode.get(record.employeeCode);

            if (!employee) {
                previewResults.push({
                    record,
                    validationStatus: 'invalid_code',
                    message: 'كود الموظف غير موجود في النظام'
                });
                continue;
            }

            const monthString = format(new Date(record.date), 'yyyy-MM');
            const attendanceDayRef = ref(db, `attendance/${monthString}`);
            const existingRecordSnapshot = await get(attendanceDayRef);
            
            let alreadyExists = false;
            if (existingRecordSnapshot.exists()) {
                const dayRecords = Object.values(existingRecordSnapshot.val());
                alreadyExists = dayRecords.some((att: any) => att.employeeId === employee.id && att.date === record.date);
            }
            

            if(alreadyExists) {
                previewResults.push({
                    record,
                    employeeNameFromSystem: employee.employeeName,
                    validationStatus: 'already_exists',
                    message: 'يوجد سجل لهذا اليوم بالفعل'
                });
            } else {
                 previewResults.push({
                    record,
                    employeeNameFromSystem: employee.employeeName,
                    validationStatus: 'valid',
                    message: 'جاهز للاستيراد'
                });
            }
        }
      
      setPreviewData(previewResults.sort((a,b) => new Date(b.record.date).getTime() - new Date(a.record.date).getTime()));
      if (previewResults.length > 0) {
        toast({ title: 'تمت معاينة الملف', description: `تم تجميع ${punches.length} بصمة في ${previewResults.length} سجل يومي.` });
      } else {
        toast({ title: 'الملف فارغ أو غير صالح', variant: 'destructive' });
      }

    } catch (error: any) {
      toast({ variant: 'destructive', title: 'فشل تحليل الملف', description: error.message || 'تأكد من أن الملف يحتوي على بيانات JSON صالحة.' });
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.json')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            processFileContent(content);
        };
        reader.readAsText(file, 'utf-8');
    } else {
        toast({ variant: 'destructive', title: 'نوع ملف غير مدعوم', description: 'الرجاء رفع ملف JSON (.json) فقط.' });
    }
  };
  
  const handleConfirmUpload = async () => {
      if (!db) {
          toast({ variant: 'destructive', title: 'خطأ في قاعدة البيانات' });
          return;
      }
      const validRecords = previewData.filter(p => p.validationStatus === 'valid').map(p => p.record);
      if (validRecords.length === 0) {
          toast({ title: 'لا توجد بيانات صالحة للرفع'});
          return;
      }
      
      setIsUploading(true);
      let successCount = 0;
      let errorCount = 0;
      
      for(const record of validRecords) {
        try {
            const employee = employeesMapByCode.get(record.employeeCode);
            if (!employee) {
                errorCount++;
                continue;
            }

            if (!record.checkIn) {
                // Skip records without a check-in
                errorCount++;
                continue;
            }
            
            const monthString = format(record.checkIn, 'yyyy-MM');
            const attendanceMonthRef = ref(db, `attendance/${monthString}`);
            
            const snapshot = await get(attendanceMonthRef);
            let existingRecordId: string | null = null;
            if (snapshot.exists()) {
                const dayRecords = snapshot.val();
                for (const id in dayRecords) {
                    if (dayRecords[id].employeeId === employee.id && dayRecords[id].date === record.date) {
                        existingRecordId = id;
                        break;
                    }
                }
            }

            let officialCheckInTime = settingsData?.workStartTime;
            if (employee.shiftConfiguration === 'custom' && employee.checkInTime) {
                officialCheckInTime = employee.checkInTime;
            }

            let delayMinutes = 0;
            if(officialCheckInTime) {
                const [hours, minutes] = officialCheckInTime.split(':').map(Number);
                const workStartToday = new Date(record.checkIn);
                workStartToday.setHours(hours, minutes, 0, 0);
                
                if (record.checkIn.getTime() > workStartToday.getTime()) {
                    delayMinutes = Math.floor((record.checkIn.getTime() - workStartToday.getTime()) / 60000);
                }
            }
            
            const attendanceRecord = {
              employeeId: employee.id,
              date: record.date,
              checkIn: record.checkIn.toISOString(),
              ...(record.checkOut && { checkOut: record.checkOut.toISOString() }),
              delayMinutes,
              employeeId_date: `${employee.id}_${record.date}`,
            };

            const recordRef = existingRecordId 
                ? ref(db, `attendance/${monthString}/${existingRecordId}`)
                : push(ref(db, `attendance/${monthString}`));

            await set(recordRef, attendanceRecord);
            successCount++;
        } catch (error) {
            errorCount++;
            console.error(`Failed to upload record for ${record.employeeCode} on ${record.date}`, error);
        }
      }

      setIsUploading(false);
      setPreviewData([]);
      toast({ title: 'اكتمل الرفع', description: `تم رفع ${successCount} سجل بنجاح، وفشل ${errorCount} سجل.`});
  }

  const getStatusBadge = (status: PreviewResult['validationStatus']) => {
    switch (status) {
        case 'valid': return <Badge variant="secondary" className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 ml-1"/> جاهز</Badge>;
        case 'invalid_code': return <Badge variant="destructive"><XCircle className="h-3 w-3 ml-1"/> كود خاطئ</Badge>;
        case 'already_exists': return <Badge variant="outline" className="border-yellow-500 text-yellow-600"><XCircle className="h-3 w-3 ml-1"/> موجود بالفعل</Badge>;
        default: return <Badge>غير معروف</Badge>;
    }
  }

  const isLoading = isEmployeesLoading || isSettingsLoading;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>رفع سجلات الحضور من ملف JSON</CardTitle>
          <CardDescription>
            اختر ملف JSON المستخرج من جهاز البصمة لبدء عملية الاستيراد.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
           <Alert>
                <FileQuestion className="h-4 w-4" />
                <AlertTitle>تعليمات هامة</AlertTitle>
                <AlertDescription>
                    <ul className="list-disc pr-5 text-sm space-y-1 mt-2">
                        <li>تأكد من أن الملف بصيغة JSON ويحتوي على مصفوفة من السجلات.</li>
                        <li>يجب أن يحتوي كل سجل على `USERID` (كود الموظف) و `CHECKTIME` (وقت الحركة) و `CHECKTYPE` (نوع الحركة 'I' للحضور و 'O' للانصراف).</li>
                        <li>سيقوم النظام بتجميع بصمات اليوم الواحد للموظف، مع اعتبار أول بصمة حضور (I) وآخر بصمة انصراف (O).</li>
                    </ul>
                </AlertDescription>
            </Alert>
          <div className="space-y-2">
            <Label htmlFor="attendance-file">اختر الملف</Label>
            <Input
              id="attendance-file"
              type="file"
              onChange={handleFileUpload}
              accept=".json"
              disabled={isProcessing || isUploading || isLoading}
            />
          </div>
          {isProcessing && (
             <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin"/>
                <span>جاري تحليل وعرض البيانات، الرجاء الانتظار...</span>
            </div>
          )}
        </CardContent>
      </Card>

      {previewData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>معاينة البيانات المجمعة قبل الرفع</CardTitle>
            <CardDescription>تم تحليل الملف وهذه هي السجلات اليومية التي سيتم رفعها. السجلات التي تحتوي على أخطاء سيتم تجاهلها.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-96">
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>كود الموظف</TableHead>
                    <TableHead>اسم الموظف</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>وقت الحضور</TableHead>
                    <TableHead>وقت الانصراف</TableHead>
                    <TableHead>الحالة</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {previewData.map((result, index) => (
                    <TableRow key={index} className={result.validationStatus === 'invalid_code' ? 'bg-destructive/10' : ''}>
                        <TableCell className="font-mono">{result.record.employeeCode}</TableCell>
                        <TableCell>{result.employeeNameFromSystem || '-'}</TableCell>
                        <TableCell>{result.record.date}</TableCell>
                        <TableCell>{result.record.checkIn?.toLocaleTimeString('ar-EG') || '-'}</TableCell>
                        <TableCell>{result.record.checkOut?.toLocaleTimeString('ar-EG') || '-'}</TableCell>
                        <TableCell>
                            {getStatusBadge(result.validationStatus)}
                            {result.validationStatus !== 'valid' && <p className="text-xs text-muted-foreground mt-1">{result.message}</p>}
                        </TableCell>
                    </TableRow>
                    ))}
                </TableBody>
                </Table>
            </ScrollArea>
             <div className="flex justify-end mt-6">
                <Button onClick={handleConfirmUpload} disabled={isUploading || previewData.filter(p=>p.validationStatus === 'valid').length === 0}>
                    {isUploading ? (
                        <><Loader2 className="ml-2 h-4 w-4 animate-spin"/> جاري الرفع...</>
                    ) : (
                        `تأكيد ورفع (${previewData.filter(p=>p.validationStatus === 'valid').length}) سجل`
                    )}
                </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
