
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, push, set, query, get, type Query } from 'firebase/database';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Send, ChevronsUpDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';


interface UserProfile {
  id: string;
  managerId?: string;
}

interface EmployeeProfile {
    id: string;
    employeeName: string;
    permissions?: string[];
}

const requestSchema = z.object({
  requestType: z.enum(['leave_full_day', 'leave_half_day', 'mission', 'permission'], {
    required_error: 'نوع الطلب مطلوب.',
  }),
  managerId: z.string().optional(),
  startDate: z.string().min(1, { message: 'تاريخ البدء مطلوب.' }),
  endDate: z.string().optional(),
  durationHours: z.coerce.number().optional(),
  notes: z.string().optional(),
}).refine(data => data.requestType === 'permission' ? !!data.durationHours && data.durationHours > 0 : true, {
    message: "عدد الساعات مطلوب لطلب الإذن",
    path: ["durationHours"],
}).refine(data => data.requestType !== 'permission' ? !!data.endDate : true, {
    message: "تاريخ الانتهاء مطلوب.",
    path: ["endDate"],
});

type RequestFormData = z.infer<typeof requestSchema>;

interface EmployeeRequest {
  id: string;
  requestType: 'leave_full_day' | 'leave_half_day' | 'mission' | 'permission';
  startDate: string;
  endDate?: string;
  durationHours?: number;
  notes: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
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


export default function RequestsPage() {
  const { toast } = useToast();
  const db = useDb();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  
  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData] = useDbData<Record<string, EmployeeProfile>>(employeesRef);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting },
    setValue
  } = useForm<RequestFormData>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      durationHours: 1,
      startDate: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    }
  });
  
  const requestType = watch('requestType');

  useEffect(() => {
    const storedProfile = localStorage.getItem('userProfile');
    if (storedProfile) {
      const profile = JSON.parse(storedProfile);
      setUserProfile(profile);
      if (profile.managerId) {
        setValue('managerId', profile.managerId);
      }
    }
  }, [setValue]);
  
  const managersList = useMemo(() => {
      if (!employeesData) return [];
      return Object.entries(employeesData)
        .filter(([, emp]) => emp.permissions && emp.permissions.some(p => p.startsWith('/admin')))
        .map(([id, emp]) => ({ value: id, label: emp.employeeName }));
  }, [employeesData]);

  const userRequestsQuery: Query | null = useMemoFirebase(() => {
    if (!db || !userProfile?.id) return null;
    return query(ref(db, `employee_requests/${userProfile.id}`));
  }, [db, userProfile]);

  const [requestsData, isLoading] = useDbData<Record<string, Omit<EmployeeRequest, 'id'>>>(userRequestsQuery);
  
  const requestsHistory: EmployeeRequest[] = useMemo(() => {
    if(!requestsData) return [];
    return Object.entries(requestsData)
        .map(([id, req]) => ({ ...req, id }))
        .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [requestsData]);

  const onSubmit = async (data: RequestFormData) => {
    if (!db || !userProfile) {
      toast({
        variant: 'destructive',
        title: 'خطأ',
        description: 'لا يمكن تقديم الطلب. لم يتم العثور على المستخدم.',
      });
      return;
    }
    
    // For permission requests, endDate is the same as startDate
    if (data.requestType === 'permission') {
        data.endDate = data.startDate;
    }
    
    // Fallback to direct manager if none is selected in the form
    if (!data.managerId) {
        data.managerId = userProfile.managerId;
    }

    try {
      const newRequestRef = push(ref(db, `employee_requests/${userProfile.id}`));
      await set(newRequestRef, {
        ...data,
        employeeId: userProfile.id,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      toast({
        title: 'تم إرسال طلبك بنجاح',
        description: 'سيتم مراجعته من قبل المدير المسؤول.',
      });
      reset({
          durationHours: 1,
          startDate: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
          managerId: userProfile.managerId
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'فشل إرسال الطلب',
        description: 'حدث خطأ ما، يرجى المحاولة مرة أخرى.',
      });
    }
  };
  
  const getInputType = (type?: RequestFormData['requestType']) => {
      const reqType = type || requestType;
      return reqType === 'leave_full_day' || reqType === 'permission' ? 'date' : 'datetime-local';
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-headline font-bold tracking-tight">
        طلبات الموظفين
      </h2>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlusCircle className="h-6 w-6" />
            تقديم طلب جديد
          </CardTitle>
          <CardDescription>
            اختر نوع الطلب واملأ البيانات المطلوبة.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="requestType">نوع الطلب</Label>
                 <Controller
                    name="requestType"
                    control={control}
                    render={({ field }) => (
                      <Select dir="rtl" onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger id="requestType">
                          <SelectValue placeholder="اختر نوع الطلب" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="leave_full_day">إجازة يوم كامل</SelectItem>
                          <SelectItem value="leave_half_day">إجازة نصف يوم</SelectItem>
                          <SelectItem value="permission">إذن (خروج مبكر)</SelectItem>
                          <SelectItem value="mission">مأمورية</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                {errors.requestType && (
                  <p className="text-sm text-red-500 mt-1">{errors.requestType.message}</p>
                )}
              </div>
              
              {requestType === 'permission' && (
                <div>
                    <Label htmlFor="durationHours">المدة (ساعات)</Label>
                    <Input id="durationHours" type="number" min="1" {...register('durationHours')} />
                    {errors.durationHours && (
                    <p className="text-sm text-red-500 mt-1">{errors.durationHours.message}</p>
                    )}
                </div>
              )}

              <div>
                <Label htmlFor="managerId">المدير المسؤول</Label>
                <Controller
                    name="managerId"
                    control={control}
                    render={({ field }) => (
                         <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                className={cn(
                                  "w-full justify-between",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value
                                  ? managersList.find(
                                      (manager) => manager.value === field.value
                                    )?.label
                                  : "اختر المدير"}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                              <Command>
                                <CommandInput placeholder="ابحث عن مدير..." />
                                <CommandEmpty>لا يوجد مدير بهذا الاسم.</CommandEmpty>
                                <CommandGroup>
                                  {managersList.map((manager) => (
                                    <CommandItem
                                      value={manager.label}
                                      key={manager.value}
                                      onSelect={() => {
                                        setValue("managerId", manager.value);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          manager.value === field.value
                                            ? "opacity-100"
                                            : "opacity-0"
                                        )}
                                      />
                                      {manager.label}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </Command>
                            </PopoverContent>
                          </Popover>
                    )}
                />
                 {errors.managerId && (
                  <p className="text-sm text-red-500 mt-1">{errors.managerId.message}</p>
                )}
              </div>

            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div>
                <Label htmlFor="startDate">
                    {requestType === 'permission' ? 'تاريخ الإذن' : 'تاريخ البدء'}
                </Label>
                <Input id="startDate" type={getInputType()} {...register('startDate')} />
                {errors.startDate && (
                  <p className="text-sm text-red-500 mt-1">{errors.startDate.message}</p>
                )}
              </div>
              {requestType !== 'permission' && (
                  <div>
                    <Label htmlFor="endDate">تاريخ الانتهاء</Label>
                    <Input id="endDate" type={getInputType()} {...register('endDate')} />
                    {errors.endDate && (
                      <p className="text-sm text-red-500 mt-1">{errors.endDate.message}</p>
                    )}
                  </div>
              )}
            </div>

            <div>
              <Label htmlFor="notes">ملاحظات</Label>
              <Textarea
                id="notes"
                placeholder="اكتب ملاحظاتك أو مبرراتك هنا..."
                {...register('notes')}
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting}>
                <Send className="ml-2 h-4 w-4" />
                {isSubmitting ? 'جاري الإرسال...' : 'إرسال الطلب'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>سجل الطلبات</CardTitle>
        </CardHeader>
        <CardContent>
           <div className="space-y-4">
            {isLoading && Array.from({length: 3}).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full"/></CardContent></Card>)}
            {!isLoading && requestsHistory.length > 0 ? (
                requestsHistory.map((request) => (
                    <Card key={request.id}>
                        <CardHeader className="p-4 flex flex-row items-center justify-between">
                            <CardTitle className="text-base">{requestTypeConfig[request.requestType]}</CardTitle>
                             <Badge variant={statusConfig[request.status].variant} className={statusConfig[request.status].color}>
                                {statusConfig[request.status].text}
                            </Badge>
                        </CardHeader>
                        <CardContent className="p-4 pt-0 space-y-2 text-sm">
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">
                                    {request.requestType === 'permission' ? 'تاريخ الإذن:' : 'الفترة:'}
                                </span>
                                {request.requestType === 'permission' ? (
                                     <span dir="ltr" className="font-mono">
                                        {new Date(request.startDate).toLocaleString('ar-EG', { day: 'numeric', month: 'short' })} ({request.durationHours} ساعات)
                                     </span>
                                ) : (
                                    <span dir="ltr" className="font-mono">
                                        {new Date(request.startDate).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}
                                    </span>
                                )}
                            </div>
                             {request.requestType !== 'permission' && request.endDate && (
                                 <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">إلى:</span>
                                    <span dir="ltr" className="font-mono">
                                        {new Date(request.endDate).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}
                                    </span>
                                </div>
                             )}
                             {request.notes && <p className="text-muted-foreground pt-2 border-t mt-2">{request.notes}</p>}
                        </CardContent>
                    </Card>
                ))
            ) : (
                <div className="h-24 text-center flex items-center justify-center">
                    {!isLoading && 'لم تقم بتقديم أي طلبات بعد.'}
                </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
