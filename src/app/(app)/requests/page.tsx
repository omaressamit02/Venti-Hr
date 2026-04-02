
'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, push, query, set, type Query } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';


interface EmployeeRequest {
  id: string;
  employeeId: string;
  managerId: string;
  requestType: 'leave_full_day' | 'leave_half_day' | 'mission' | 'permission_early' | 'permission_late';
  startDate: string;
  endDate: string;
  durationHours?: number;
  notes: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

interface UserProfile {
  id: string;
  employeeName: string;
  managerId?: string;
}

interface Manager {
    id: string;
    employeeName: string;
}


const statusConfig: { [key: string]: { text: string; variant: "secondary" | "destructive" | "outline"; color: string; } } = {
  pending: { text: 'قيد المراجعة', variant: 'outline', color: 'border-yellow-500 text-yellow-500' },
  approved: { text: 'تمت الموافقة', variant: 'secondary', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' },
  rejected: { text: 'مرفوض', variant: 'destructive', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400' },
};

const requestTypeConfig: { [key: string]: string } = {
    leave_full_day: 'إجازة يوم كامل',
    leave_half_day: 'إجازة نصف يوم',
    mission: 'مأمورية',
    permission_early: 'إذن (خروج مبكر)',
    permission_late: 'إذن (حضور متأخر)',
};

export default function EmployeeRequestsPage() {
  const db = useDb();
  const { toast } = useToast();
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [isDialogOpen, setDialogOpen] = useState(false);

  // New Request Form State
  const [requestType, setRequestType] = useState<'leave_full_day' | 'leave_half_day' | 'mission' | 'permission_early' | 'permission_late'>('leave_full_day');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [durationHours, setDurationHours] = useState<number | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [selectedManager, setSelectedManager] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const storedProfile = localStorage.getItem('userProfile');
    if (storedProfile && storedProfile.trim() !== '' && storedProfile !== 'undefined' && storedProfile !== 'null') {
        try {
            const profile = JSON.parse(storedProfile);
            if (profile && typeof profile === 'object') {
                setCurrentUserProfile(profile);
                if (profile.managerId) {
                    setSelectedManager(profile.managerId);
                }
            }
        } catch (e) {
            console.error("Error parsing profile in Requests", e);
            localStorage.removeItem('userProfile');
        }
    }
  }, []);

  const employeeRequestsQuery: Query | null = useMemoFirebase(() => {
    if (!db || !currentUserProfile?.id) return null;
    return query(ref(db, `employee_requests/${currentUserProfile.id}`));
  }, [db, currentUserProfile?.id]);
  const [requestsData, isRequestsLoading] = useDbData<Record<string, Omit<EmployeeRequest, 'id' | 'employeeId'>>>(employeeRequestsQuery);

  const employeesRef = useMemoFirebase(() => db ? ref(db, `employees`) : null, [db]);
  const [employeesData, isEmployeesLoading] = useDbData<Record<string, { employeeName: string, permissions?: string[], managerId?: string, isManager?: boolean }>>(employeesRef);

  const managers = useMemo<Manager[]>(() => {
    if (!employeesData) return [];
    
    // An admin with permissions for requests page is a manager
    const hasRequestsPermission = (permissions: string[] = []) => permissions.includes('/admin/requests');

    return Object.entries(employeesData)
        .filter(([id, emp]) => emp.isManager || hasRequestsPermission(emp.permissions))
        .map(([id, emp]) => ({ id, employeeName: emp.employeeName }));
  }, [employeesData]);

  useEffect(() => {
    // If a default manager is not set, and there are managers, select the first one.
    if (!selectedManager && currentUserProfile?.managerId === undefined && managers.length > 0) {
        setSelectedManager(managers[0].id);
    }
    // if a default manager is set but not in the list (e.g. inactive), select first from list
    if (selectedManager && !managers.some(m => m.id === selectedManager) && managers.length > 0) {
        setSelectedManager(managers[0].id);
    }

  }, [managers, selectedManager, currentUserProfile?.managerId]);


  const sortedRequests = useMemo(() => {
    if (!requestsData) return [];
    return Object.entries(requestsData)
        .map(([id, req]) => ({ ...req, id }))
        .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [requestsData]);
  

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !currentUserProfile) {
        toast({ variant: 'destructive', title: 'خطأ', description: 'لا يمكن الاتصال بالخدمة.' });
        return;
    }
    
    if (!selectedManager) {
        toast({ variant: 'destructive', title: 'بيانات ناقصة', description: 'الرجاء اختيار المدير المسؤول.' });
        return;
    }

    if (requestType.startsWith('permission') && (!durationHours || durationHours <= 0)) {
        toast({ variant: 'destructive', title: 'بيانات ناقصة', description: 'الرجاء تحديد عدد ساعات الإذن.' });
        return;
    }
    
    setIsSubmitting(true);

    try {
        const newRequestRef = push(ref(db, `employee_requests/${currentUserProfile.id}`));

        const newRequest: Omit<EmployeeRequest, 'id'> = {
            employeeId: currentUserProfile.id,
            managerId: selectedManager,
            requestType,
            startDate: requestType.startsWith('permission') ? startDate : new Date(startDate).toISOString(),
            endDate: requestType.startsWith('permission') ? startDate : new Date(endDate).toISOString(),
            ...(requestType.startsWith('permission') && { durationHours }),
            notes,
            status: 'pending',
            createdAt: new Date().toISOString(),
        };

        await set(newRequestRef, newRequest);
        
        toast({ title: 'تم إرسال طلبك بنجاح' });
        setDialogOpen(false);
        // Reset form
        setRequestType('leave_full_day');
        const today = format(new Date(), 'yyyy-MM-dd');
        setStartDate(today);
        setEndDate(today);
        setDurationHours(undefined);
        setNotes('');

    } catch (error) {
        toast({ variant: 'destructive', title: 'فشل إرسال الطلب' });
    } finally {
        setIsSubmitting(false);
    }
  }
  
  useEffect(() => {
    if (!requestType.startsWith('permission') && startDate) {
      setEndDate(startDate);
    }
  }, [startDate, requestType]);

  const isLoading = isRequestsLoading || isEmployeesLoading || !currentUserProfile;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-headline font-bold tracking-tight">
          طلباتي
        </h2>
        <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
                <Button>
                    <PlusCircle className="ml-2 h-4 w-4" />
                    طلب جديد
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                 <form onSubmit={handleSubmitRequest}>
                    <DialogHeader>
                        <DialogTitle>تقديم طلب جديد</DialogTitle>
                        <DialogDescription>
                            اختر نوع الطلب واملأ التفاصيل اللازمة.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4" dir="rtl">
                        <div className="space-y-2">
                            <Label htmlFor="request-type">نوع الطلب</Label>
                            <Select dir="rtl" value={requestType} onValueChange={(v: any) => setRequestType(v)}>
                                <SelectTrigger id="request-type"><SelectValue placeholder="اختر النوع" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="leave_full_day">إجازة يوم كامل</SelectItem>
                                    <SelectItem value="leave_half_day">إجازة نصف يوم</SelectItem>
                                    <SelectItem value="mission">مأمورية</SelectItem>
                                    <SelectItem value="permission_early">إذن (خروج مبكر)</SelectItem>
                                    <SelectItem value="permission_late">إذن (حضور متأخر)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                         <div className="space-y-2">
                             <Label htmlFor="manager">المدير المسؤول</Label>
                             <Select dir="rtl" value={selectedManager} onValueChange={setSelectedManager}>
                                <SelectTrigger id="manager"><SelectValue placeholder="اختر المدير" /></SelectTrigger>
                                <SelectContent>
                                    {isEmployeesLoading ? <SelectItem value="loading" disabled>جاري التحميل...</SelectItem> :
                                        managers.map(manager => (
                                            <SelectItem key={manager.id} value={manager.id}>{manager.employeeName}</SelectItem>
                                        ))
                                    }
                                </SelectContent>
                             </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="start-date">
                                {requestType.startsWith('permission') ? 'تاريخ الإذن' : 'من تاريخ'}
                            </Label>
                            <Input id="start-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required/>
                        </div>

                       {!requestType.startsWith('permission') && (
                         <div className="space-y-2">
                            <Label htmlFor="end-date">إلى تاريخ</Label>
                            <Input id="end-date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} required/>
                        </div>
                       )}
                       {requestType.startsWith('permission') && (
                         <div className="space-y-2">
                            <Label htmlFor="duration">مدة الإذن (بالساعات)</Label>
                            <Input id="duration" type="number" value={durationHours || ''} onChange={e => setDurationHours(Number(e.target.value))} placeholder="e.g. 2" required min="1"/>
                        </div>
                       )}

                        <div className="space-y-2">
                            <Label htmlFor="notes">ملاحظات (اختياري)</Label>
                            <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="سبب الطلب أو أي تفاصيل إضافية..."/>
                        </div>

                    </div>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>إلغاء</Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? 'جاري الإرسال...' : 'إرسال الطلب'}
                        </Button>
                    </DialogFooter>
                 </form>
            </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>سجل الطلبات</CardTitle>
          <CardDescription>عرض جميع الطلبات السابقة والحالية الخاصة بك.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">نوع الطلب</TableHead>
                  <TableHead className="text-right">الفترة / المدة</TableHead>
                  <TableHead className="text-right">تاريخ التقديم</TableHead>
                  <TableHead className="text-center">الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isRequestsLoading && Array.from({length: 3}).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={4}><Skeleton className="w-full h-8" /></TableCell>
                  </TableRow>
                ))}
                {!isRequestsLoading && sortedRequests.length > 0 ? (
                  sortedRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium text-right">{requestTypeConfig[request.requestType]}</TableCell>
                      <TableCell className="text-right text-sm">
                         {request.requestType.startsWith('permission') ? (
                            <span>{request.durationHours} ساعات في يوم {new Date(request.startDate).toLocaleDateString('ar-EG', { day: '2-digit', month: 'short' })}</span>
                        ) : (
                            <span dir="ltr">
                                {new Date(request.startDate).toLocaleDateString('ar-EG', { day: '2-digit', month: 'short' })}
                                { request.startDate !== request.endDate && ` - ${new Date(request.endDate).toLocaleDateString('ar-EG', { day: '2-digit', month: 'short' })}` }
                            </span>
                        )}
                      </TableCell>
                       <TableCell className="text-right text-muted-foreground">{new Date(request.createdAt).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric'})}</TableCell>
                      <TableCell className="text-center">
                          <Badge variant={statusConfig[request.status]?.variant || 'default'} className={statusConfig[request.status]?.color}>
                              {statusConfig[request.status]?.text || request.status}
                          </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      {isRequestsLoading ? 'جاري تحميل الطلبات...' : 'لم تقم بتقديم أي طلبات بعد.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-4 md:hidden">
             {isRequestsLoading && Array.from({length: 2}).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full"/></CardContent></Card>)}
             {!isRequestsLoading && sortedRequests.length > 0 ? (
                sortedRequests.map((request) => (
                    <Card key={request.id}>
                         <CardHeader className="p-4 flex flex-row items-center justify-between">
                            <CardTitle className="text-base">{requestTypeConfig[request.requestType]}</CardTitle>
                             <Badge variant={statusConfig[request.status]?.variant || 'default'} className={statusConfig[request.status]?.color}>
                                {statusConfig[request.status]?.text || request.status}
                            </Badge>
                        </CardHeader>
                        <CardContent className="p-4 pt-0 space-y-2 text-sm">
                           <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">الفترة/المدة:</span>
                                {request.requestType.startsWith('permission') ? (
                                    <span>{request.durationHours} ساعات في يوم {new Date(request.startDate).toLocaleDateString('ar-EG', { day: '2-digit', month: 'short' })}</span>
                                ) : (
                                    <span dir="ltr">
                                        {new Date(request.startDate).toLocaleDateString('ar-EG', { day: '2-digit', month: 'short' })} - {new Date(request.endDate).toLocaleDateString('ar-EG', { day: '2-digit', month: 'short' })}
                                    </span>
                                )}
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">تاريخ التقديم:</span>
                                <span>{new Date(request.createdAt).toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'long' })}</span>
                            </div>
                             {request.notes && <p className="text-muted-foreground pt-2 border-t mt-2">{request.notes}</p>}
                        </CardContent>
                    </Card>
                ))
            ) : (
                <div className="h-24 text-center flex items-center justify-center">
                    {isRequestsLoading ? 'جاري تحميل الطلبات...' : 'لا توجد طلبات لعرضها.'}
                </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
