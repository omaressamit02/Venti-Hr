'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, remove } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Filter, Map, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';


interface Employee {
  id: string;
  employeeName: string;
}

interface LoginLog {
  id: string;
  employeeId?: string;
  employeeName?: string;
  employeeCode: string;
  timestamp: string;
  status: 'success' | 'failure';
  failureReason?: string;
  location?: {
    lat: number;
    lon: number;
  };
  deviceId: string;
  userAgent: string;
}

export default function LoginLogsPage() {
  const db = useDb();
  const { toast } = useToast();

  const logsRef = useMemoFirebase(() => db ? ref(db, 'login_logs') : null, [db]);
  const [logsData, isLogsLoading] = useDbData<Record<string, Omit<LoginLog, 'id'>>>(logsRef);

  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData, isEmployeesLoading] = useDbData<Record<string, Employee>>(employeesRef);

  const [filters, setFilters] = useState({
    employee: 'all',
    status: 'all',
    fromDate: '',
    toDate: '',
  });

  const allLogsData: LoginLog[] = useMemo(() => {
    if (!logsData) return [];
    return Object.entries(logsData)
      .map(([id, log]) => ({ ...log, id }))
      .sort((a, b) => parseISO(b.timestamp).getTime() - parseISO(a.timestamp).getTime());
  }, [logsData]);

  const filteredLogs = useMemo(() => {
    return allLogsData.filter(log => {
      const logDate = parseISO(log.timestamp);
      if (filters.employee !== 'all' && log.employeeId !== filters.employee) return false;
      if (filters.status !== 'all' && log.status !== filters.status) return false;
      if (filters.fromDate && logDate < new Date(filters.fromDate)) return false;
      if (filters.toDate) {
        const toDate = new Date(filters.toDate);
        toDate.setDate(toDate.getDate() + 1);
        if (logDate >= toDate) return false;
      }
      return true;
    });
  }, [allLogsData, filters]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const employeesList: (Employee & { id: string })[] = useMemo(() => {
    if (!employeesData) return [];
    return Object.entries(employeesData).map(([id, data]) => ({ ...data, id }));
  }, [employeesData]);

  const handleDeleteAllLogs = async () => {
    if (!logsRef) {
        toast({ variant: 'destructive', title: 'خطأ في قاعدة البيانات' });
        return;
    }
    try {
        await remove(logsRef);
        toast({ title: 'تم الحذف بنجاح', description: 'تم حذف جميع سجلات الدخول.' });
    } catch (error) {
        toast({ variant: 'destructive', title: 'فشل الحذف', description: 'لم نتمكن من حذف السجلات.' });
    }
  };

  const isLoading = isLogsLoading || isEmployeesLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-3xl font-headline font-bold tracking-tight">
            سجل الدخول للنظام
        </h2>
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="destructive">
                    <Trash2 className="ml-2 h-4 w-4" />
                    حذف كل السجلات
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
                    <AlertDialogDescription>
                        هذا الإجراء سيقوم بحذف جميع سجلات محاولات الدخول بشكل نهائي. لا يمكن التراجع عن هذا الإجراء.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteAllLogs} className="bg-destructive hover:bg-destructive/90">
                        نعم، قم بالحذف
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-6 w-6" />
            فلترة السجلات
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="employee-filter">الموظف</Label>
              <Select dir="rtl" onValueChange={(v) => handleFilterChange('employee', v)} defaultValue="all">
                <SelectTrigger id="employee-filter"><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الموظفين</SelectItem>
                  {isEmployeesLoading ? <SelectItem value="loading" disabled>جاري التحميل...</SelectItem> :
                    employeesList.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>{emp.employeeName}</SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status-filter">حالة الدخول</Label>
              <Select dir="rtl" onValueChange={(v) => handleFilterChange('status', v)} defaultValue="all">
                <SelectTrigger id="status-filter"><SelectValue placeholder="اختر الحالة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="success">ناجح</SelectItem>
                  <SelectItem value="failure">فاشل</SelectItem>
                </SelectContent>
              </Select>
            </div>
             <div className="space-y-2">
              <Label htmlFor="from-date">من تاريخ</Label>
              <Input id="from-date" type="date" onChange={e => handleFilterChange('fromDate', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to-date">إلى تاريخ</Label>
              <Input id="to-date" type="date" onChange={e => handleFilterChange('toDate', e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle>قائمة محاولات تسجيل الدخول</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Desktop Table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الموظف</TableHead>
                  <TableHead className="text-right">الوقت والتاريخ</TableHead>
                  <TableHead className="text-right">الحالة / السبب</TableHead>
                  <TableHead className="text-right">معرف الجهاز</TableHead>
                  <TableHead className="text-right">المتصفح</TableHead>
                  <TableHead className="text-center">الموقع</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && Array.from({length: 5}).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}><Skeleton className="w-full h-8" /></TableCell>
                  </TableRow>
                ))}
                {!isLoading && filteredLogs.length > 0 ? (
                  filteredLogs.map((log) => (
                    <TableRow key={log.id} className={log.status === 'failure' ? 'bg-destructive/5' : ''}>
                      <TableCell className="font-medium text-right">
                        <div>{log.employeeName || 'غير معروف'}</div>
                        <div className="text-xs text-muted-foreground font-mono">{log.employeeCode}</div>
                      </TableCell>
                      <TableCell className="text-right">{new Date(log.timestamp).toLocaleString('ar-EG')}</TableCell>
                      <TableCell className="text-right">
                        {log.status === 'success' ? (
                            <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
                                <CheckCircle className="ml-2 h-4 w-4" />
                                دخول ناجح
                            </Badge>
                        ) : (
                             <Badge variant="destructive">
                                <XCircle className="ml-2 h-4 w-4" />
                                دخول فاشل: {log.failureReason || 'غير معروف'}
                            </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground font-mono">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="truncate max-w-[120px] cursor-help">{log.deviceId}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{log.deviceId}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground max-w-[200px] truncate" title={log.userAgent}>
                        {log.userAgent}
                      </TableCell>
                      <TableCell className="text-center">
                        {log.location ? (
                            <Button size="sm" variant="outline" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${log.location?.lat},${log.location?.lon}`, '_blank')}>
                                <Map className="ml-2 h-4 w-4"/>
                                عرض
                            </Button>
                        ) : (
                            <span className="text-xs text-muted-foreground">غير متاح</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      {isLoading ? 'جاري تحميل السجلات...' : 'لا توجد سجلات لعرضها حسب الفلتر المحدد.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Cards */}
          <div className="space-y-4 md:hidden">
            {isLoading && Array.from({length: 3}).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full"/></CardContent></Card>)}
            {!isLoading && filteredLogs.length > 0 ? (
                filteredLogs.map((log) => (
                    <Card key={log.id} className={log.status === 'failure' ? 'border-destructive/30 bg-destructive/5' : ''}>
                        <CardHeader className="p-4 pb-2">
                           <div className="flex justify-between items-start">
                             <div>
                                <CardTitle className="text-base">{log.employeeName || log.employeeCode}</CardTitle>
                                <CardDescription>{new Date(log.timestamp).toLocaleString('ar-EG')}</CardDescription>
                            </div>
                             {log.location && (
                                <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${log.location?.lat},${log.location?.lon}`, '_blank')}>
                                    <Map className="h-4 w-4"/>
                                </Button>
                            )}
                           </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-2 space-y-3 text-sm">
                            <div>
                                {log.status === 'success' ? (
                                    <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
                                        <CheckCircle className="ml-2 h-4 w-4" />
                                        دخول ناجح
                                    </Badge>
                                ) : (
                                     <Badge variant="destructive">
                                        <XCircle className="ml-2 h-4 w-4" />
                                        دخول فاشل: {log.failureReason || 'غير معروف'}
                                    </Badge>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate pt-2 border-t font-mono" title={log.deviceId}>
                                <span className="font-sans text-foreground">المعرف: </span>{log.deviceId}
                            </p>
                            <p className="text-xs text-muted-foreground truncate" title={log.userAgent}>{log.userAgent}</p>
                        </CardContent>
                    </Card>
                ))
            ) : (
                <div className="h-24 text-center flex items-center justify-center">
                    {isLoading ? 'جاري تحميل السجلات...' : 'لا توجد سجلات لعرضها.'}
                </div>
            )}
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
