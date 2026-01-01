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
import { Badge } from '@/components/ui/badge';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, update, get } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Filter, Check, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Employee {
  id: string;
  employeeName: string;
  managerId?: string;
  permissions?: string[];
}

interface UserProfile {
  id: string;
  employeeName: string;
  permissions?: string[];
}

interface EmployeeRequest {
  id: string;
  employeeId: string;
  managerId?: string; // ID of the manager chosen to approve
  requestType: 'leave_full_day' | 'leave_half_day' | 'mission' | 'permission';
  startDate: string;
  endDate: string;
  durationHours?: number;
  notes: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

interface RequestViewModel extends EmployeeRequest {
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
    permission: 'إذن (خروج مبكر)',
};

export default function AdminRequestsPage() {
  const db = useDb();
  const { toast } = useToast();
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);

  const requestsRef = useMemoFirebase(() => db ? ref(db, 'employee_requests') : null, [db]);
  const [requestsData, isRequestsLoading] = useDbData<Record<string, Record<string, Omit<EmployeeRequest, 'id' | 'employeeId'>>>>(requestsRef);

  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData, isEmployeesLoading] = useDbData<Record<string, Employee>>(employeesRef);

 useEffect(() => {
    const fetchCurrentUser = async () => {
        const storedProfile = localStorage.getItem('userProfile');
        if (storedProfile) {
            const profile = JSON.parse(storedProfile);
            // If it's the superuser, we don't need to fetch from DB
            if (profile.id === 'superuser') {
                setCurrentUserProfile(profile);
                return;
            }
            // For regular users, fetch fresh data from DB to ensure permissions are up-to-date
            if (db && profile.id) {
                const userRef = ref(db, `employees/${profile.id}`);
                const snapshot = await get(userRef);
                if (snapshot.exists()) {
                    setCurrentUserProfile({ ...snapshot.val(), id: profile.id });
                } else {
                     setCurrentUserProfile(profile); // Fallback to local storage if not found
                }
            } else {
                 setCurrentUserProfile(profile);
            }
        }
    };
    fetchCurrentUser();
  }, [db]);


  const [filters, setFilters] = useState({
    employee: 'all',
    status: 'all',
    fromDate: '',
    toDate: '',
  });

  const employeesMap = useMemo(() => {
    if (!employeesData) return new Map();
    return new Map(Object.entries(employeesData).map(([id, emp]) => [id, emp.employeeName]));
  }, [employeesData]);

  const allRequestsData = useMemo(() => {
    if (!requestsData || !employeesData || !currentUserProfile) return [];
    
    const allRequests: RequestViewModel[] = [];
    const isSuperUser = currentUserProfile.id === 'superuser';
    const hasAdminPermission = currentUserProfile.permissions?.includes('/admin/requests');
    const canSeeAll = isSuperUser || hasAdminPermission;

    Object.entries(requestsData).forEach(([employeeId, employeeRequests]) => {
        const employeeProfile = employeesData[employeeId];

        Object.entries(employeeRequests).forEach(([requestId, request]) => {
            const isManagerOfRequest = request.managerId === currentUserProfile.id;
            const isDirectManager = employeeProfile?.managerId === currentUserProfile.id;
            
            if (canSeeAll || isManagerOfRequest || (isDirectManager && !request.managerId)) {
                allRequests.push({
                    ...request,
                    id: requestId,
                    employeeId,
                    employeeName: employeesMap.get(employeeId) || 'غير معروف',
                });
            }
        });
    });
    
    return allRequests.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [requestsData, employeesData, currentUserProfile, employeesMap]);

  const filteredRequests = useMemo(() => {
    return allRequestsData.filter(request => {
      if (filters.employee !== 'all' && request.employeeId !== filters.employee) return false;
      if (filters.status !== 'all' && request.status !== filters.status) return false;
      
      const requestDate = new Date(request.startDate);
      if (filters.fromDate && requestDate < new Date(filters.fromDate)) return false;
      if (filters.toDate) {
          const toDate = new Date(filters.toDate);
          toDate.setHours(23, 59, 59, 999); // Include the whole day
          if (requestDate > toDate) return false;
      }
      
      return true;
    });
  }, [allRequestsData, filters]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };
  
  const handleStatusChange = async (employeeId: string, requestId: string, newStatus: 'approved' | 'rejected') => {
      if (!db) {
          toast({ variant: 'destructive', title: 'خطأ في قاعدة البيانات'});
          return;
      }
      try {
        const requestRef = ref(db, `employee_requests/${employeeId}/${requestId}`);
        await update(requestRef, { status: newStatus });
        toast({ title: 'تم تحديث حالة الطلب بنجاح' });
      } catch (error) {
        toast({ variant: 'destructive', title: 'فشل تحديث الطلب' });
      }
  };

  const employeesList: (Employee & { id: string })[] = useMemo(() => {
    if (!employeesData) return [];
    return Object.entries(employeesData).map(([id, data]) => ({ ...data, id }));
  }, [employeesData]);

  const isLoading = isRequestsLoading || isEmployeesLoading || !currentUserProfile;

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-headline font-bold tracking-tight">
        إدارة طلبات الموظفين
      </h2>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-6 w-6" />
            فلترة الطلبات
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
              <Label htmlFor="status-filter">حالة الطلب</Label>
              <Select dir="rtl" onValueChange={(v) => handleFilterChange('status', v)} defaultValue="all">
                <SelectTrigger id="status-filter"><SelectValue placeholder="اختر الحالة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="pending">قيد المراجعة</SelectItem>
                  <SelectItem value="approved">تمت الموافقة</SelectItem>
                  <SelectItem value="rejected">مرفوض</SelectItem>
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
          <CardTitle>قائمة الطلبات</CardTitle>
          <CardDescription>عرض جميع الطلبات المقدمة من الموظفين واتخاذ الإجراءات اللازمة.</CardDescription>
        </CardHeader>
        <CardContent>
        {/* Desktop Table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">اسم الموظف</TableHead>
                  <TableHead className="text-right">نوع الطلب</TableHead>
                  <TableHead className="text-right">الفترة / المدة</TableHead>
                  <TableHead className="text-right">ملاحظات</TableHead>
                  <TableHead className="text-center">الحالة</TableHead>
                  <TableHead className="text-center">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && Array.from({length: 5}).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}><Skeleton className="w-full h-8" /></TableCell>
                  </TableRow>
                ))}
                {!isLoading && filteredRequests.length > 0 ? (
                  filteredRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium text-right">{request.employeeName}</TableCell>
                      <TableCell className="text-right">{requestTypeConfig[request.requestType]}</TableCell>
                      <TableCell className="text-right text-sm">
                        {request.requestType === 'permission' ? (
                            <span>{request.durationHours} ساعات في يوم {new Date(request.startDate).toLocaleDateString('ar-EG', { day: '2-digit', month: 'short' })}</span>
                        ) : (
                            <span dir="ltr">
                                {new Date(request.startDate).toLocaleDateString('ar-EG', { day: '2-digit', month: 'short' })}
                                {' - '}
                                {new Date(request.endDate).toLocaleDateString('ar-EG', { day: '2-digit', month: 'short' })}
                            </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{request.notes || '-'}</TableCell>
                      <TableCell className="text-center">
                          <Badge variant={statusConfig[request.status]?.variant || 'default'} className={statusConfig[request.status]?.color}>
                              {statusConfig[request.status]?.text || request.status}
                          </Badge>
                      </TableCell>
                       <TableCell className="text-center">
                          {request.status === 'pending' ? (
                              <div className="flex gap-2 justify-center">
                                <Button size="icon" variant="outline" className="text-green-600 border-green-600 hover:bg-green-50 h-8 w-8" onClick={() => handleStatusChange(request.employeeId, request.id, 'approved')}>
                                    <Check className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="outline" className="text-red-600 border-red-600 hover:bg-red-50 h-8 w-8" onClick={() => handleStatusChange(request.employeeId, request.id, 'rejected')}>
                                    <X className="h-4 w-4" />
                                </Button>
                              </div>
                          ): (
                            <span className="text-xs text-muted-foreground">تم اتخاذ إجراء</span>
                          )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      {isLoading ? 'جاري تحميل الطلبات...' : 'لا توجد طلبات لعرضها.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {/* Mobile Cards */}
          <div className="space-y-4 md:hidden">
            {isLoading && Array.from({length: 3}).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full"/></CardContent></Card>)}
            {!isLoading && filteredRequests.length > 0 ? (
                filteredRequests.map((request) => (
                    <Card key={request.id}>
                         <CardHeader className="p-4 flex flex-row items-center justify-between">
                            <CardTitle className="text-base">{request.employeeName}</CardTitle>
                             <Badge variant={statusConfig[request.status]?.variant || 'default'} className={statusConfig[request.status]?.color}>
                                {statusConfig[request.status]?.text || request.status}
                            </Badge>
                        </CardHeader>
                        <CardContent className="p-4 pt-0 space-y-2 text-sm">
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">النوع:</span>
                                <span>{requestTypeConfig[request.requestType]}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">الفترة/المدة:</span>
                                {request.requestType === 'permission' ? (
                                    <span>{request.durationHours} ساعات في يوم {new Date(request.startDate).toLocaleDateString('ar-EG', { day: '2-digit', month: 'short' })}</span>
                                ) : (
                                    <span dir="ltr">
                                        {new Date(request.startDate).toLocaleDateString('ar-EG', { day: '2-digit', month: 'short' })} - {new Date(request.endDate).toLocaleDateString('ar-EG', { day: '2-digit', month: 'short' })}
                                    </span>
                                )}
                            </div>
                             {request.notes && <p className="text-muted-foreground pt-2 border-t mt-2">{request.notes}</p>}
                             {request.status === 'pending' && (
                                <div className="flex gap-2 justify-end pt-4">
                                    <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleStatusChange(request.employeeId, request.id, 'approved')}>
                                        <Check className="ml-2 h-4 w-4" /> موافقة
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={() => handleStatusChange(request.employeeId, request.id, 'rejected')}>
                                        <X className="ml-2 h-4 w-4" /> رفض
                                    </Button>
                                </div>
                             )}
                        </CardContent>
                    </Card>
                ))
            ) : (
                <div className="h-24 text-center flex items-center justify-center">
                    {isLoading ? 'جاري تحميل الطلبات...' : 'لا توجد طلبات لعرضها.'}
                </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
