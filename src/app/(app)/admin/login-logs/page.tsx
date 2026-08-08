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
import { Filter, Map as MapIcon, CheckCircle, XCircle, Trash2, Smartphone, Globe, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { arEG } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';


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

  const openMap = (lat: number, lon: number) => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-3xl font-headline font-bold tracking-tight">
            سجل الأمان والدخول
        </h2>
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                    <Trash2 className="ml-2 h-4 w-4" />
                    مسح السجلات
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>تأكيد مسح البيانات</AlertDialogTitle>
                    <AlertDialogDescription>
                        سيتم حذف جميع سجلات محاولات الدخول وتتبع الموقع بشكل نهائي. هل تريد الاستمرار؟
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteAllLogs} className="bg-destructive hover:bg-destructive/90">
                        نعم، مسح الكل
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" /> تصفية السجلات
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">الموظف</Label>
              <Select dir="rtl" onValueChange={(v) => handleFilterChange('employee', v)} value={filters.employee}>
                <SelectTrigger className="h-9"><SelectValue placeholder="الكل" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الموظفين</SelectItem>
                  {employeesList.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.employeeName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">الحالة</Label>
              <Select dir="rtl" onValueChange={(v) => handleFilterChange('status', v)} value={filters.status}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="success">دخول ناجح</SelectItem>
                  <SelectItem value="failure">فشل الدخول</SelectItem>
                </SelectContent>
              </Select>
            </div>
             <div className="space-y-2">
              <Label className="text-xs">من تاريخ</Label>
              <Input type="date" className="h-9" onChange={e => handleFilterChange('fromDate', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">إلى تاريخ</Label>
              <Input type="date" className="h-9" onChange={e => handleFilterChange('toDate', e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardContent className="p-0">
          {/* Desktop Table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-right">الموظف</TableHead>
                  <TableHead className="text-right">الوقت</TableHead>
                  <TableHead className="text-right">الحالة / المصدر</TableHead>
                  <TableHead className="text-right">الجهاز</TableHead>
                  <TableHead className="text-center">الموقع</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({length: 5}).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
                  ))
                ) : filteredLogs.length > 0 ? (
                  filteredLogs.map((log) => (
                    <TableRow key={log.id} className={cn(log.status === 'failure' && 'bg-destructive/5')}>
                      <TableCell className="text-right">
                        <div className="font-bold text-sm">{log.employeeName || 'غير معروف'}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{log.employeeCode}</div>
                      </TableCell>
                      <TableCell className="text-right text-xs">
                          {format(parseISO(log.timestamp), 'yyyy/MM/dd', { locale: arEG })}
                          <div className="font-bold">{format(parseISO(log.timestamp), 'hh:mm a', { locale: arEG })}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={log.status === 'success' ? 'secondary' : 'destructive'} className="text-[10px] px-2 py-0">
                            {log.status === 'success' ? 'دخول آمن' : `فشل: ${log.failureReason}`}
                        </Badge>
                        <div className="text-[9px] text-muted-foreground mt-1 max-w-[150px] truncate" title={log.userAgent}>{log.userAgent}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                            <Smartphone className="h-3 w-3" />
                            <span className="truncate max-w-[80px]">{log.deviceId}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {log.location ? (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={() => openMap(log.location!.lat, log.location!.lon)}>
                                <MapIcon className="h-4 w-4"/>
                            </Button>
                        ) : <span className="text-[10px] text-muted-foreground">--</span>}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">لا توجد سجلات مطابقة.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile View (Cards) */}
          <div className="md:hidden space-y-3 p-4">
            {isLoading ? Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />) :
             filteredLogs.length > 0 ? filteredLogs.map((log) => (
                <Card key={log.id} className={cn("overflow-hidden border-2", log.status === 'failure' ? 'border-red-200 bg-red-50/30' : 'border-border')}>
                    <CardHeader className="p-3 pb-2 flex flex-row justify-between items-start space-y-0">
                        <div>
                            <CardTitle className="text-sm font-bold">{log.employeeName || log.employeeCode}</CardTitle>
                            <CardDescription className="text-[10px]">
                                {format(parseISO(log.timestamp), 'EEEE, d MMMM - hh:mm a', { locale: arEG })}
                            </CardDescription>
                        </div>
                        <Badge variant={log.status === 'success' ? 'secondary' : 'destructive'} className="text-[9px]">
                            {log.status === 'success' ? 'دخول ناجح' : 'فشل الدخول'}
                        </Badge>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 space-y-3">
                        <div className="flex justify-between items-end border-t pt-2 mt-1">
                            <div className="space-y-1">
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <Globe className="h-3 w-3" />
                                    <span className="truncate max-w-[150px]">{log.userAgent}</span>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                                    <Smartphone className="h-3 w-3" />
                                    <span>ID: {log.deviceId.slice(0, 12)}...</span>
                                </div>
                            </div>
                            {log.location && (
                                <Button size="sm" variant="outline" className="h-8 text-[10px] gap-1" onClick={() => openMap(log.location!.lat, log.location!.lon)}>
                                    <MapIcon className="h-3 w-3" /> عرض الموقع <ExternalLink className="h-2 w-2" />
                                </Button>
                            )}
                        </div>
                        {log.status === 'failure' && log.failureReason && (
                            <p className="text-[10px] text-red-600 font-bold bg-red-100 p-1 rounded text-center">السبب: {log.failureReason}</p>
                        )}
                    </CardContent>
                </Card>
             )) : <p className="text-center py-10 text-muted-foreground text-sm">لا توجد سجلات دخول.</p>
            }
          </div>
        </CardContent>
      </Card>
    </div>
  );
}