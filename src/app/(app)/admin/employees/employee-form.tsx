
'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref } from 'firebase/database';
import { navItems } from '@/lib/nav-items';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';

const employeeFormSchema = z.object({
  employeeName: z.string().min(1, 'اسم الموظف مطلوب'),
  employeeCode: z.string().min(1, 'كود الموظف مطلوب'),
  phoneNumber: z.string().optional(),
  gender: z.enum(['male', 'female'], { required_error: 'الجنس مطلوب' }),
  birthDate: z.string().optional(),
  salary: z.coerce.number().min(0, 'الراتب يجب أن يكون رقمًا موجبًا'),
  password: z.string().optional(),
  shiftConfiguration: z.enum(['general', 'custom']),
  checkInTime: z.string().optional(),
  checkOutTime: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  locationIds: z.array(z.string()).optional(),
  dayOff: z.string().optional(),
  managerId: z.string().optional(),
  isManager: z.boolean().default(false),
  disableDeductions: z.boolean().default(false),
  locationLoginRequired: z.boolean().default(false),
});

export type EmployeeFormData = z.infer<typeof employeeFormSchema>;

interface EmployeeFormProps {
  onSubmit: (data: EmployeeFormData) => void;
  defaultValues?: Partial<EmployeeFormData>;
  currentEmployeeId?: string;
}

type Location = {
    id: string;
    name: string;
};

type GlobalSettings = {
    locations: Location[];
    workStartTime?: string;
    workEndTime?: string;
};

type Employee = {
    id: string;
    employeeName: string;
    isManager?: boolean;
};

const permissionNavItems = navItems.filter(item => !item.superAdminOnly);

export function EmployeeForm({ onSubmit, defaultValues = {}, currentEmployeeId }: EmployeeFormProps) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: {
      disableDeductions: false,
      locationLoginRequired: false,
      isManager: false,
      permissions: navItems.filter(item => !item.adminOnly && !item.superAdminOnly).map(i => i.href),
      ...defaultValues,
    },
  });

  const db = useDb();
  
  const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
  const [settings] = useDbData<GlobalSettings>(settingsRef);
  
  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData] = useDbData<Record<string, Employee>>(employeesRef);

  const locationsList = useMemo(() => {
    if (!settings?.locations) return [];
    const locationsRaw = Array.isArray(settings.locations) ? settings.locations : Object.values(settings.locations);
    return locationsRaw.filter((loc: any): loc is Location => !!(loc?.id && loc?.name));
  }, [settings]);
  
  const employeesList = useMemo(() => {
      if (!employeesData) return [];
      return Object.entries(employeesData)
        .map(([id, emp]) => ({ value: id, label: emp.employeeName }))
        .filter(emp => emp.value !== currentEmployeeId);
  }, [employeesData, currentEmployeeId]);

  const managersList = useMemo(() => {
    if (!employeesData) return [];
    return Object.entries(employeesData)
      .filter(([, emp]) => emp.isManager)
      .map(([id, emp]) => ({ value: id, label: emp.employeeName }))
      .filter(emp => emp.value !== currentEmployeeId);
  }, [employeesData, currentEmployeeId]);


  const shiftConfiguration = watch('shiftConfiguration');
  const watchPermissions = watch('permissions') || [];
  const watchLocationIds = watch('locationIds') || [];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="employeeName">اسم الموظف</Label>
          <Input id="employeeName" {...register('employeeName')} />
          {errors.employeeName && <p className="text-destructive text-xs">{errors.employeeName.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="employeeCode">كود الموظف</Label>
          <Input id="employeeCode" {...register('employeeCode')} />
          {errors.employeeCode && <p className="text-destructive text-xs">{errors.employeeCode.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
         <div className="space-y-2">
            <Label htmlFor="phoneNumber">رقم الهاتف</Label>
            <Input id="phoneNumber" {...register('phoneNumber')} />
        </div>
        <div className="space-y-2">
            <Label htmlFor="salary">الراتب الأساسي</Label>
            <Input id="salary" type="number" {...register('salary')} />
            {errors.salary && <p className="text-destructive text-xs">{errors.salary.message}</p>}
        </div>
      </div>
      
       <div className="space-y-2">
            <Label htmlFor="password">كلمة المرور (اتركه فارغًا لعدم التغيير)</Label>
            <Input id="password" type="password" {...register('password')} />
        </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>الجنس</Label>
          <Controller
            name="gender"
            control={control}
            render={({ field }) => (
              <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-4">
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="male" id="male" />
                  <Label htmlFor="male">ذكر</Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="female" id="female" />
                  <Label htmlFor="female">أنثى</Label>
                </div>
              </RadioGroup>
            )}
          />
           {errors.gender && <p className="text-destructive text-xs">{errors.gender.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="birthDate">تاريخ الميلاد</Label>
          <Input id="birthDate" type="date" {...register('birthDate')} />
        </div>
      </div>

      <div className="space-y-2">
          <Label htmlFor="dayOff">يوم الإجازة الأسبوعي</Label>
          <Controller
            name="dayOff"
            control={control}
            render={({ field }) => (
                <Select dir="rtl" onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger id="dayOff"><SelectValue placeholder="اختر يوم..." /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="6">السبت</SelectItem>
                        <SelectItem value="0">الأحد</SelectItem>
                        <SelectItem value="1">الاثنين</SelectItem>
                        <SelectItem value="2">الثلاثاء</SelectItem>
                        <SelectItem value="3">الأربعاء</SelectItem>
                        <SelectItem value="4">الخميس</SelectItem>
                        <SelectItem value="5">الجمعة</SelectItem>
                    </SelectContent>
                </Select>
            )}
          />
      </div>

        <div className="space-y-2">
            <Label htmlFor="managerId">المدير المباشر</Label>
             <Controller
                name="managerId"
                control={control}
                render={({ field }) => (
                     <Popover>
                        <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            className={cn("w-full justify-between", !field.value && "text-muted-foreground")}
                        >
                            {field.value ? managersList.find(emp => emp.value === field.value)?.label : "اختر المدير"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                        <Command>
                            <CommandInput placeholder="ابحث عن مدير..." />
                            <CommandEmpty>لا يوجد مدير بهذا الاسم.</CommandEmpty>
                            <CommandGroup>
                            {managersList.map((employee) => (
                                <CommandItem
                                value={employee.label}
                                key={employee.value}
                                onSelect={() => field.onChange(employee.value)}
                                >
                                <Check className={cn("mr-2 h-4 w-4", employee.value === field.value ? "opacity-100" : "opacity-0")} />
                                {employee.label}
                                </CommandItem>
                            ))}
                            </CommandGroup>
                        </Command>
                        </PopoverContent>
                    </Popover>
                )}
            />
        </div>

      <div className="space-y-4 rounded-md border p-4">
        <Label>إعدادات الوردية</Label>
        <Controller
          name="shiftConfiguration"
          control={control}
          render={({ field }) => (
            <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-4">
              <div className="flex items-center space-x-2 space-x-reverse">
                <RadioGroupItem value="general" id="general" />
                <Label htmlFor="general">وردية عامة</Label>
              </div>
              <div className="flex items-center space-x-2 space-x-reverse">
                <RadioGroupItem value="custom" id="custom" />
                <Label htmlFor="custom">وردية خاصة</Label>
              </div>
            </RadioGroup>
          )}
        />
        {shiftConfiguration === 'custom' && (
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="checkInTime">وقت الحضور</Label>
              <Input id="checkInTime" type="time" {...register('checkInTime')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="checkOutTime">وقت الانصراف</Label>
              <Input id="checkOutTime" type="time" {...register('checkOutTime')} />
            </div>
          </div>
        )}
      </div>

       <div className="space-y-4 rounded-md border p-4">
            <Label>صلاحيات الوصول للشاشات</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-60 overflow-y-auto">
                {permissionNavItems.map((item) => (
                    <div key={item.href} className="flex items-center space-x-2 space-x-reverse">
                        <Checkbox
                            id={item.href}
                            checked={watchPermissions.includes(item.href)}
                            onCheckedChange={(checked) => {
                                const currentPermissions = watchPermissions;
                                const newPermissions = checked
                                ? [...currentPermissions, item.href]
                                : currentPermissions.filter((p) => p !== item.href);
                                control.setValue('permissions', newPermissions);
                            }}
                        />
                        <label htmlFor={item.href} className="text-sm font-medium leading-none">
                            {item.label}
                        </label>
                    </div>
                ))}
            </div>
        </div>

        <div className="space-y-4 rounded-md border p-4">
            <Label>الفروع المصرح له العمل بها</Label>
            <p className="text-xs text-muted-foreground">إذا لم يتم اختيار أي فرع، سيعتبر الموظف قادرًا على العمل في جميع الفروع.</p>
             <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-60 overflow-y-auto">
                {locationsList.map((loc) => (
                     <div key={loc.id} className="flex items-center space-x-2 space-x-reverse">
                        <Checkbox
                            id={`loc-${loc.id}`}
                            checked={watchLocationIds.includes(loc.id)}
                            onCheckedChange={(checked) => {
                                const currentLocationIds = watchLocationIds;
                                const newLocationIds = checked
                                ? [...currentLocationIds, loc.id]
                                : currentLocationIds.filter((id) => id !== loc.id);
                                control.setValue('locationIds', newLocationIds);
                            }}
                        />
                         <label htmlFor={`loc-${loc.id}`} className="text-sm font-medium leading-none">
                            {loc.name}
                        </label>
                    </div>
                ))}
            </div>
        </div>
        
        <div className="space-y-4 rounded-md border p-4">
             <div className="flex items-center justify-between">
                <Label htmlFor="isManager" className="flex-grow">تعيين كمدير</Label>
                 <Controller
                    name="isManager"
                    control={control}
                    render={({ field }) => (
                        <Switch
                            id="isManager"
                            checked={field.value}
                            onCheckedChange={field.onChange}
                        />
                    )}
                />
            </div>
             <p className="text-xs text-muted-foreground">
                إذا تم تفعيل هذا الخيار، سيظهر هذا الموظف في قائمة المدراء عند إضافة أو تعديل موظف آخر.
            </p>
            <div className="flex items-center justify-between">
                <Label htmlFor="disableDeductions" className="flex-grow">إيقاف خصومات التأخير التلقائية</Label>
                 <Controller
                    name="disableDeductions"
                    control={control}
                    render={({ field }) => (
                        <Switch
                            id="disableDeductions"
                            checked={field.value}
                            onCheckedChange={field.onChange}
                        />
                    )}
                />
            </div>
             <div className="flex items-center justify-between">
                <Label htmlFor="locationLoginRequired" className="flex-grow">إلزام تسجيل الدخول من داخل نطاق الفرع</Label>
                 <Controller
                    name="locationLoginRequired"
                    control={control}
                    render={({ field }) => (
                        <Switch
                            id="locationLoginRequired"
                            checked={field.value}
                            onCheckedChange={field.onChange}
                        />
                    )}
                />
            </div>
        </div>


      <div className="flex justify-end">
        <Button type="submit">حفظ الموظف</Button>
      </div>
    </form>
  );
}
