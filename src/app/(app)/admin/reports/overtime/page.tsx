
'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, update } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { format, subMonths, addDays } from 'date-fns';
import { arEG } from 'date-fns/locale';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Clock, Filter, Users, Calendar, TrendingUp, Check, X, Edit2, AlertCircle, Loader2, ArrowRightLeft, Timer } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Employee {
  id: string;
  employeeName: string;
}

interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  checkIn: string;
  checkOut?: string;
  officialCheckInTime?: string;
  officialCheckOutTime?: string;
  overtimeMinutes?: number;
  overtimeStatus?: 'pending' | 'approved' | 'rejected';
}

export default function OvertimeReportPage() {
  const [isMounted, setIsMounted] = useState(false);
  const db = useDb();
  const { toast } = useToast();
  const [reportMonth, setReportMonth] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Dialog State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [editMinutes, setEditMinutes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    setReportMonth(format(new Date(), 'yyyy-MM'));
  }, []);

  // --- Data Fetching ---
  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData, isEmployeesLoading] = useDbData<Record<string, Employee>>(employeesRef);

  const attendanceRef = useMemoFirebase(() => (db && reportMonth) ? ref(db, `attendance/${reportMonth}`) : null, [db, reportMonth]);
  const [attendanceData, isAttendanceLoading] = useDbData<Record<string, AttendanceRecord>>(attendanceRef);

  const employeesMap = useMemo(() => {
    if (!employeesData) return new Map();
    return new Map(Object.entries(employeesData).map(([id, emp]) => [id, emp.employeeName]));
  }, [employeesData]);

  const allRecords = useMemo(() => {
    if (!attendanceData || !isMounted) return [];

    return Object.entries(attendanceData)
      .map(([id, rec]) => {
          const checkInDate = new Date(rec.checkIn);
          const checkOutDate = rec.checkOut ? new Date(rec.checkOut) : null;
          
          let workHours = 0;
          if (checkInDate && checkOutDate) {
              workHours = (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60);
          }

          // Build Official Checkout Date correctly
          let potentialOvertime = rec.overtimeMinutes || 0;
          if (!rec.overtimeStatus && checkOutDate && rec.officialCheckOutTime && rec.officialCheckInTime) {
             const [outH, outM] = rec.officialCheckOutTime.split(':').map(Number);
             const [inH, inM] = rec.officialCheckInTime.split(':').map(Number);
             
             const officialOutDate = new Date(`${rec.date}T${rec.officialCheckOutTime}:00`);
             // If night shift (Out < In), official checkout is next day
             if (outH < inH) {
                 officialOutDate.setDate(officialOutDate.getDate() + 1);
             }

             if (checkOutDate.getTime() > officialOutDate.getTime()) {
                 potentialOvertime = Math.floor((checkOutDate.getTime() - officialOutDate.getTime()) / 60000);
             }
          }

          return {
            ...rec,
            id,
            potentialOvertime,
            workHours: Math.max(0, workHours),
            employeeName: employeesMap.get(rec.employeeId) || 'غير معروف'
          };
      })
      .filter(rec => 
        (rec.overtimeStatus || rec.potentialOvertime > 0) &&
        rec.employeeName.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [attendanceData, employeesMap, searchTerm, isMounted]);

  const stats = useMemo(() => {
    const approved = allRecords.filter(r => r.overtimeStatus === 'approved');
    const totalMinutes = approved.reduce((acc, curr) => acc + (curr.overtimeMinutes || 0), 0);
    const pendingCount = allRecords.filter(r => !r.overtimeStatus || r.overtimeStatus === 'pending').length;
    return {
      totalMinutes,
      totalHours: (totalMinutes / 60).toFixed(2),
      approvedCount: approved.length,
      pendingCount
    };
  }, [allRecords]);

  const handleAction = async (record: any, status: 'approved' | 'rejected', minutes?: number) => {
    if (!db || isProcessing) return;
    setIsProcessing(true);
    try {
        const finalMinutes = minutes !== undefined ? minutes : (record.overtimeMinutes || record.potentialOvertime);
        await update(ref(db, `attendance/${reportMonth}/${record.id}`), {
            overtimeStatus: status,
            overtimeMinutes: status === 'approved' ? finalMinutes : 0
        });
        toast({ title: status === 'approved' ? 'تم اعتماد الوقت الإضافي' : 'تم رفض الوقت الإضافي' });
        setIsEditOpen(false);
    } catch (error) {
        toast({ variant: 'destructive', title: 'فشل التحديث' });
    } finally {
        setIsProcessing(false);
    }
  };

  const openEdit = (record: any) => {
      setSelectedRecord(record);
      setEditMinutes((record.overtimeMinutes || record.potentialOvertime).toString());
      setIsEditOpen(true);
  };

  const months = Array.from({ length: 12 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM'));
  const isLoading = isEmployeesLoading || isAttendanceLoading || !isMounted;

  const formatDateTime = (isoString?: string) => {
      if (!isoString) return '-';
      const date = new Date(isoString);
      return format(date, 'yyyy/MM/dd HH:mm', { locale: arEG });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl md:text-3xl font-headline font-bold tracking-tight flex items-center gap-2 text-primary">
          <Clock className="h-8 w-8" />
          إدارة الوقت الإضافي والورديات
        </h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" /> تصفية السجلات</CardTitle>
          <CardDescription>راجع واعتمد ساعات العمل الإضافية للموظفين (بما في ذلك الورديات الليلية).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>الشهر</Label>
              <Select dir="rtl" value={reportMonth} onValueChange={setReportMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {months.map(m => (
                    <SelectItem key={m} value={m}>
                      {new Date(m + "-02").toLocaleString("ar", { month: "long", year: "numeric" })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>بحث عن موظف</Label>
              <Input 
                placeholder="اسم الموظف..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-green-50 border-green-100">
          <CardHeader className="p-4 pb-1"><CardTitle className="text-xs text-green-700 font-bold">إجمالي المعتمد</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0">
             <div className="text-xl font-bold text-green-700 font-mono">{stats.totalHours} <span className="text-xs">ساعة</span></div>
          </CardContent>
        </Card>
        <Card className={cn(stats.pendingCount > 0 ? "bg-amber-50 border-amber-200" : "")}>
          <CardHeader className="p-4 pb-1"><CardTitle className="text-xs font-bold">بانتظار المراجعة</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0">
             <div className="text-xl font-bold">{stats.pendingCount} <span className="text-xs text-muted-foreground">سجل</span></div>
          </CardContent>
        </Card>
        <Card className="hidden lg:block">
          <CardHeader className="p-4 pb-1"><CardTitle className="text-xs font-bold">الموظفون المستفيدون</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0">
             <div className="text-xl font-bold">{new Set(allRecords.map(r => r.employeeId)).size}</div>
          </CardContent>
        </Card>
         <Card className="hidden lg:block">
          <CardHeader className="p-4 pb-1"><CardTitle className="text-xs font-bold">إجمالي السجلات</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0">
             <div className="text-xl font-bold">{allRecords.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>كشف التفاصيل اليومية</CardTitle></CardHeader>
        <CardContent>
          {/* Desktop View */}
          <div className="hidden md:block overflow-x-auto border rounded-md">
            <Table className="min-w-[1100px] whitespace-nowrap">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-right">يوم العمل</TableHead>
                  <TableHead className="text-right">الموظف</TableHead>
                  <TableHead className="text-right">المواعيد الرسمية</TableHead>
                  <TableHead className="text-right">الحضور الفعلي</TableHead>
                  <TableHead className="text-right">الانصراف الفعلي</TableHead>
                  <TableHead className="text-center">ساعات العمل</TableHead>
                  <TableHead className="text-left font-bold text-primary">الإضافي (د)</TableHead>
                  <TableHead className="text-center">الحالة</TableHead>
                  <TableHead className="text-center">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
                  ))
                ) : allRecords.length > 0 ? (
                  allRecords.map(rec => (
                    <TableRow key={rec.id} className={cn(!rec.overtimeStatus && "bg-amber-50/20")}>
                      <TableCell className="text-right font-bold text-xs">{rec.date}</TableCell>
                      <TableCell className="text-right">
                          <div className="font-bold">{rec.employeeName}</div>
                      </TableCell>
                      <TableCell className="text-right text-[10px] text-muted-foreground">
                        <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {rec.officialCheckInTime} - {rec.officialCheckOutTime}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatDateTime(rec.checkIn)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatDateTime(rec.checkOut)}</TableCell>
                      <TableCell className="text-center font-bold text-slate-600">{rec.workHours.toFixed(2)} س</TableCell>
                      <TableCell className="text-left font-mono font-black text-primary">
                        +{rec.overtimeStatus === 'approved' ? rec.overtimeMinutes : rec.potentialOvertime}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={rec.overtimeStatus === 'approved' ? 'secondary' : rec.overtimeStatus === 'rejected' ? 'destructive' : 'outline'} 
                               className={cn("text-[10px]", rec.overtimeStatus === 'approved' && "bg-green-100 text-green-800")}>
                            {rec.overtimeStatus === 'approved' ? 'معتمد' : rec.overtimeStatus === 'rejected' ? 'مرفوض' : 'قيد المراجعة'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-1">
                            {(!rec.overtimeStatus || rec.overtimeStatus === 'pending') ? (
                                <>
                                    <Button size="icon" variant="outline" className="h-8 w-8 text-green-600 border-green-200" onClick={() => handleAction(rec, 'approved')}><Check className="h-4 w-4"/></Button>
                                    <Button size="icon" variant="outline" className="h-8 w-8 text-red-600 border-red-200" onClick={() => handleAction(rec, 'rejected')}><X className="h-4 w-4"/></Button>
                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(rec)}><Edit2 className="h-3 w-3"/></Button>
                                </>
                            ) : (
                                <Button size="sm" variant="outline" className="text-[10px] h-7" onClick={() => openEdit(rec)}>تعديل</Button>
                            )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={9} className="h-32 text-center text-muted-foreground">لا توجد سجلات وقت إضافي لهذا الشهر.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile View */}
          <div className="md:hidden space-y-4">
             {isLoading ? Array.from({length:3}).map((_,i)=><Skeleton key={i} className="h-48 w-full rounded-xl"/>) :
              allRecords.map(rec => (
                <Card key={rec.id} className={cn("overflow-hidden border-r-4", rec.overtimeStatus === 'approved' ? "border-r-green-500" : rec.overtimeStatus === 'rejected' ? "border-r-red-500" : "border-r-amber-500")}>
                    <CardHeader className="p-4 pb-2 bg-muted/20">
                         <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-muted-foreground">{rec.date}</span>
                            <Badge variant={rec.overtimeStatus === 'approved' ? 'secondary' : rec.overtimeStatus === 'rejected' ? 'destructive' : 'outline'}>
                                {rec.overtimeStatus === 'approved' ? 'معتمد' : rec.overtimeStatus === 'rejected' ? 'مرفوض' : 'قيد المراجعة'}
                            </Badge>
                        </div>
                        <CardTitle className="text-lg mt-1">{rec.employeeName}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 space-y-4 text-xs">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-2 bg-slate-50 rounded border">
                                <p className="text-muted-foreground mb-1">الموعد الرسمي</p>
                                <p className="font-bold">{rec.officialCheckInTime} - {rec.officialCheckOutTime}</p>
                            </div>
                            <div className="p-2 bg-slate-50 rounded border text-center">
                                <p className="text-muted-foreground mb-1">ساعات العمل</p>
                                <p className="font-bold text-slate-700">{rec.workHours.toFixed(2)} ساعة</p>
                            </div>
                        </div>

                        <div className="space-y-2 border-y py-3">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">تاريخ الحضور:</span>
                                <span className="font-mono">{formatDateTime(rec.checkIn)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">تاريخ الانصراف:</span>
                                <span className="font-mono">{formatDateTime(rec.checkOut)}</span>
                            </div>
                        </div>

                        <div className="flex justify-between items-center bg-primary/5 p-3 rounded-lg border border-primary/10">
                            <div className="flex items-center gap-2">
                                <Timer className="h-4 w-4 text-primary" />
                                <span className="font-bold">الوقت الإضافي المستحق:</span>
                            </div>
                            <span className="text-lg font-black text-primary">+{rec.overtimeStatus === 'approved' ? rec.overtimeMinutes : rec.potentialOvertime} دقيقة</span>
                        </div>

                        <div className="flex gap-2 pt-2">
                             <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 h-10 font-bold" onClick={() => handleAction(rec, 'approved')} disabled={rec.overtimeStatus === 'approved'}>
                                <Check className="ml-1 h-4 w-4"/> اعتماد
                             </Button>
                             <Button size="sm" variant="outline" className="flex-1 text-red-600 border-red-200 h-10 font-bold" onClick={() => handleAction(rec, 'rejected')} disabled={rec.overtimeStatus === 'rejected'}>
                                <X className="ml-1 h-4 w-4"/> رفض
                             </Button>
                             <Button size="icon" variant="secondary" className="h-10 w-10 shrink-0" onClick={() => openEdit(rec)}><Edit2 className="h-4 w-4"/></Button>
                        </div>
                    </CardContent>
                </Card>
              ))
             }
          </div>
        </CardContent>
      </Card>

      {/* Edit/Approve Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
              <DialogHeader><DialogTitle>مراجعة وتعديل الوقت الإضافي</DialogTitle></DialogHeader>
              <div className="py-4 space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-primary/5 rounded-xl border border-primary/10">
                      <AlertCircle className="h-6 w-6 text-primary" />
                      <div className="text-sm">
                          <p className="font-bold text-lg">{selectedRecord?.employeeName}</p>
                          <p className="text-muted-foreground">يوم العمل: {selectedRecord?.date}</p>
                      </div>
                  </div>
                  <div className="space-y-2">
                      <Label className="text-base">عدد الدقائق المعتمدة للصرف</Label>
                      <Input type="number" className="text-lg font-mono" value={editMinutes} onChange={e => setEditMinutes(e.target.value)} />
                      <div className="flex justify-between items-center text-[11px] text-muted-foreground bg-muted p-2 rounded">
                          <span>الوقت الفعلي المسجل للزيادة:</span>
                          <span className="font-bold text-foreground">{selectedRecord?.potentialOvertime} دقيقة</span>
                      </div>
                  </div>
              </div>
              <DialogFooter className="flex flex-col sm:flex-row gap-2">
                  <Button variant="destructive" className="flex-1" onClick={() => handleAction(selectedRecord, 'rejected')} disabled={isProcessing}>رفض و إلغاء الإضافي</Button>
                  <Button className="flex-1" onClick={() => handleAction(selectedRecord, 'approved', parseInt(editMinutes))} disabled={isProcessing}>
                    {isProcessing ? <Loader2 className="h-4 w-4 animate-spin"/> : <Check className="ml-2 h-4 w-4"/>}
                    اعتماد {editMinutes} دقيقة
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </div>
  );
}

