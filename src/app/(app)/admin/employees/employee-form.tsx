
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { navItems } from '@/lib/nav-items';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref } from 'firebase/database';
import { useMemo, useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Command, CommandInput, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

const employeeFormSchema = z.object({
  employeeName: z.string().min(2, { message: 'الاسم مطلوب.' }),
  employeeCode: z.string().min(1, { message: 'كود الموظف مطلوب.' }),
  phoneNumber: z.string().optional(),
  password: z.string().optional(),
  gender: z.enum(['male', 'female'], { required_error: 'الجنس مطلوب.'}),
  birthDate: z.string().optional(),
  salary: z.coerce.number().min(0, { message: 'الراتب يجب أن يكون رقماً.' }),
  shiftConfiguration: z.enum(['general', 'custom']),
  checkInTime: z.string().optional(),
  checkOutTime: z.string().optional(),
  permissions: z.array(z.string()).default([]),
  locationIds: z.array(z.string()).optional(),
  dayOff: z.string().optional(),
  managerId: z.string().optional(),
  disableDeductions: z.boolean().default(false),
  locationLoginRequired: z.boolean().default(false),
});

export type EmployeeFormData = z.infer<typeof employeeFormSchema>;

interface EmployeeFormProps {
  onSubmit: (data: EmployeeFormData) => void;
  defaultValues?: Partial<EmployeeFormData>;
  currentEmployeeId?: string | null;
}

type Location = {
  id: string;
  name: string;
};

type Employee = {
    id: string;
    employeeName: string;
};

type GlobalSettings = {
    locations: Location[];
};

const weekDays = [
    { value: '6', label: 'السبت' },
    { value: '0', label: 'الأحد' },
    { value: '1', label: 'الإثنين' },
    { value: '2', label: 'الثلاثاء' },
    { value: '3', label: 'الأربعاء' },
    { value: '4', label: 'الخميس' },
    { value: '5', label: 'الجمعة' },
];


export function EmployeeForm({ onSubmit, defaultValues, currentEmployeeId }: EmployeeFormProps) {
  const form = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: {
        employeeName: '',
        employeeCode: '',
        phoneNumber: '',
        password: '',
        birthDate: '',
        salary: 0,
        shiftConfiguration: 'general',
        checkInTime: '',
        checkOutTime: '',
        dayOff: '5', 
        managerId: '',
        locationIds: [], 
        disableDeductions: false,
        locationLoginRequired: false,
        ...defaultValues,
        permissions: defaultValues?.permissions || navItems.filter(item => !item.adminOnly).map(item => item.href),
    },
  });

  const shiftType = form.watch('shiftConfiguration');
  const db = useDb();
  
  const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
  const [settings] = useDbData<GlobalSettings>(settingsRef);
  
  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData] = useDbData<Record<string, Omit<Employee, 'id'>>>(employeesRef);
  
  const [locationsOpen, setLocationsOpen] = useState(false);

  const employeesList = useMemo(() => {
    if (!employeesData) return [];
    return Object.entries(employeesData)
        .map(([id, data]) => ({ value: id, label: data.employeeName }))
        // Exclude the current employee from the list of possible managers
        .filter(emp => emp.value !== currentEmployeeId);
  }, [employeesData, currentEmployeeId]);
  
  const locations = settings?.locations && Array.isArray(settings.locations)
      ? settings.locations
      : settings?.locations && typeof settings.locations === 'object'
      ? Object.values(settings.locations)
      : [];
  
  const permissionNavItems = navItems.filter(item => !item.superAdminOnly);


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="employeeName"
          render={({ field }) => (
            <FormItem className="grid grid-cols-4 items-center gap-4">
              <FormLabel className="text-right">الاسم</FormLabel>
              <FormControl className="col-span-3">
                <Input {...field} />
              </FormControl>
              <FormMessage className="col-span-4" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="employeeCode"
          render={({ field }) => (
            <FormItem className="grid grid-cols-4 items-center gap-4">
              <FormLabel className="text-right">كود الموظف</FormLabel>
              <FormControl className="col-span-3">
                <Input {...field} />
              </FormControl>
              <FormMessage className="col-span-4" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phoneNumber"
          render={({ field }) => (
            <FormItem className="grid grid-cols-4 items-center gap-4">
              <FormLabel className="text-right">رقم الهاتف</FormLabel>
              <FormControl className="col-span-3">
                <Input type="tel" {...field} />
              </FormControl>
              <FormMessage className="col-span-4" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem className="grid grid-cols-4 items-center gap-4">
              <FormLabel className="text-right">كلمة المرور</FormLabel>
              <FormControl className="col-span-3">
                <Input type="password" {...field} placeholder="اتركه فارغًا لعدم التغيير"/>
              </FormControl>
              <FormMessage className="col-span-4" />
            </FormItem>
          )}
        />
         <FormField
          control={form.control}
          name="birthDate"
          render={({ field }) => (
            <FormItem className="grid grid-cols-4 items-center gap-4">
              <FormLabel className="text-right">تاريخ الميلاد</FormLabel>
              <FormControl className="col-span-3">
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage className="col-span-4" />
            </FormItem>
          )}
        />
        <FormField
            control={form.control}
            name="gender"
            render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                    <FormLabel className="text-right">الجنس</FormLabel>
                    <FormControl className="col-span-3">
                        <RadioGroup
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            className="flex gap-4"
                            dir="rtl"
                        >
                            <FormItem className="flex items-center space-x-2 space-x-reverse">
                                <FormControl>
                                    <RadioGroupItem value="male" />
                                </FormControl>
                                <FormLabel className="font-normal">ذكر</FormLabel>
                            </FormItem>
                            <FormItem className="flex items-center space-x-2 space-x-reverse">
                                <FormControl>
                                    <RadioGroupItem value="female" />
                                </FormControl>
                                <FormLabel className="font-normal">أنثى</FormLabel>
                            </FormItem>
                        </RadioGroup>
                    </FormControl>
                    <FormMessage className="col-span-4" />
                </FormItem>
            )}
        />
        <FormField
          control={form.control}
          name="salary"
          render={({ field }) => (
            <FormItem className="grid grid-cols-4 items-center gap-4">
              <FormLabel className="text-right">الراتب</FormLabel>
              <FormControl className="col-span-3">
                <Input type="number" {...field} />
              </FormControl>
              <FormMessage className="col-span-4" />
            </FormItem>
          )}
        />
        
        <Separator/>

        <FormField
          control={form.control}
          name="locationIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-base">الفروع المخصصة</FormLabel>
              <Popover open={locationsOpen} onOpenChange={setLocationsOpen}>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between h-auto min-h-10"
                    >
                      <div className="flex gap-1 flex-wrap">
                        {field.value && field.value.length > 0 ? (
                           locations
                            .filter(loc => field.value?.includes(loc.id))
                            .map(loc => <Badge key={loc.id} variant="secondary">{loc.name}</Badge>)
                        ) : (
                          <span className="text-muted-foreground">اختر الفروع...</span>
                        )}
                      </div>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="ابحث عن فرع..." />
                    <CommandList>
                        <CommandEmpty>لم يتم العثور على فرع.</CommandEmpty>
                        <CommandGroup>
                        {locations.map((location) => (
                            <CommandItem
                            key={location.id}
                            onSelect={() => {
                                const selected = field.value || [];
                                const isSelected = selected.includes(location.id);
                                if (isSelected) {
                                form.setValue('locationIds', selected.filter(id => id !== location.id));
                                } else {
                                form.setValue('locationIds', [...selected, location.id]);
                                }
                            }}
                            >
                            <div className={cn(
                                "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                field.value?.includes(location.id) ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible"
                            )}>
                                <Check className={cn("h-4 w-4")} />
                            </div>
                            <span>{location.name}</span>
                            </CommandItem>
                        ))}
                        </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <Separator/>
        
        <FormField
          control={form.control}
          name="dayOff"
          render={({ field }) => (
            <FormItem className="grid grid-cols-4 items-center gap-4">
              <FormLabel className="text-right">يوم الإجازة الأسبوعي</FormLabel>
               <Select dir="rtl" onValueChange={field.onChange} value={field.value}>
                <FormControl className="col-span-3">
                  <SelectTrigger>
                    <SelectValue placeholder="اختر يوم الإجازة" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {weekDays.map((day) => (
                    <SelectItem key={day.value} value={day.value}>
                      {day.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage className="col-span-4" />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="managerId"
          render={({ field }) => (
             <FormItem className="grid grid-cols-4 items-center gap-4">
              <FormLabel className="text-right">المدير المباشر</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl className="col-span-3">
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        "w-full justify-between",
                        !field.value && "text-muted-foreground"
                      )}
                    >
                      {field.value
                        ? employeesList.find(
                            (employee) => employee.value === field.value
                          )?.label
                        : "اختر المدير"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                  <Command>
                    <CommandInput placeholder="ابحث عن مدير..." />
                    <CommandEmpty>لا يوجد موظف بهذا الاسم.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                          value=""
                          onSelect={() => {
                            form.setValue("managerId", "");
                          }}
                        >
                          بلا مدير
                        </CommandItem>
                      {employeesList.map((employee) => (
                        <CommandItem
                          value={employee.label}
                          key={employee.value}
                          onSelect={() => {
                            form.setValue("managerId", employee.value);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              employee.value === field.value
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          {employee.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
              <FormMessage className="col-span-4" />
            </FormItem>
          )}
        />


        <Separator />

        <FormField
          control={form.control}
          name="shiftConfiguration"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>لائحة الحضور والانصراف</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="flex flex-col space-y-1"
                  dir="rtl"
                >
                  <FormItem className="flex items-center space-x-2 space-x-reverse">
                    <FormControl>
                      <RadioGroupItem value="general" />
                    </FormControl>
                    <FormLabel className="font-normal">يتبع اللائحة العامة</FormLabel>
                  </FormItem>
                  <FormItem className="flex items-center space-x-2 space-x-reverse">
                    <FormControl>
                      <RadioGroupItem value="custom" />
                    </FormControl>
                    <FormLabel className="font-normal">تحديد وقت خاص</FormLabel>
                  </FormItem>
                </RadioGroup>
              </FormControl>
            </FormItem>
          )}
        />
        {shiftType === 'custom' && (
          <div className="grid grid-cols-2 gap-4 animate-in fade-in">
            <FormField
              control={form.control}
              name="checkInTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>وقت الحضور</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="checkOutTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>وقت الانصراف</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        )}

        <Separator />

        <FormField
            control={form.control}
            name="disableDeductions"
            render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                    <FormLabel className="text-base">
                    تعطيل لوائح الخصم
                    </FormLabel>
                    <FormMessage />
                </div>
                <FormControl>
                    <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    />
                </FormControl>
                </FormItem>
            )}
        />

        <FormField
            control={form.control}
            name="locationLoginRequired"
            render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                    <FormLabel className="text-base">
                    فرض تسجيل الدخول من موقع الفرع فقط
                    </FormLabel>
                    <FormMessage />
                </div>
                <FormControl>
                    <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    />
                </FormControl>
                </FormItem>
            )}
        />

        <Separator />
        
        <FormField
          control={form.control}
          name="permissions"
          render={() => (
            <FormItem>
              <div className="mb-3">
                <FormLabel className="text-base">صلاحيات الوصول للشاشات</FormLabel>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                {permissionNavItems.map((item) => (
                  <FormField
                    key={item.href}
                    control={form.control}
                    name="permissions"
                    render={({ field }) => {
                      return (
                        <FormItem
                          key={item.href}
                          className="flex items-center space-x-2 space-x-reverse"
                        >
                          <FormControl>
                            <Checkbox
                              checked={(field.value || []).includes(item.href)}
                              onCheckedChange={(checked) => {
                                const currentValue = field.value || [];
                                return checked
                                  ? field.onChange([...currentValue, item.href])
                                  : field.onChange(
                                      currentValue.filter(
                                        (value) => value !== item.href
                                      )
                                    )
                              }}
                            />
                          </FormControl>
                          <FormLabel className="font-normal text-sm">
                            {item.label}
                          </FormLabel>
                        </FormItem>
                      )
                    }}
                  />
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end pt-4">
          <Button type="submit">حفظ البيانات</Button>
        </div>
      </form>
    </Form>
  );
}
