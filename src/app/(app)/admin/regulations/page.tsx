
'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Save, PlusCircle, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, set } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';


type Location = {
  id: string;
  name: string;
  lat: string;
  lon: string;
};

type DeductionRule = {
    id: string;
    fromMinutes: number;
    toMinutes: number;
    deductionType: 'day_deduction' | 'fixed_amount' | 'hour_deduction' | 'minute_deduction';
    deductionValue: number;
};

type FixedDeduction = {
    id: string;
    name: string;
    type: 'fixed' | 'percentage';
    value: number;
    transactionType: 'deduction' | 'addition';
};

type GlobalSettings = {
    companyName: string;
    employeeAlert?: string;
    workStartTime: string;
    workEndTime: string;
    lateAllowance: number;
    lateAllowanceScope?: 'daily' | 'monthly';
    overtimeEnabled: boolean;
    overtimeRate?: number;
    holidayWorkCompensationType?: 'leave' | 'cash';
    holidayWorkLeaveMultiplier?: number;
    holidayWorkCashAmount?: number;
    qrRefreshInterval: number;
    qrCodeRequired: boolean;
    locationRestriction: string;
    locationRadius: number;
    locations: Location[];
    payrollDay: number;
    currency: string;
    deductionRules?: DeductionRule[];
    earlyLeaveDeductionRules?: DeductionRule[];
    fixedDeductions?: FixedDeduction[];
    deductionForAbsence?: number;
    deductionForIncompleteRecord?: number;
};

const defaultSettings: GlobalSettings = {
  companyName: 'حضورى',
  workStartTime: '08:00',
  workEndTime: '16:00',
  lateAllowance: 15,
  lateAllowanceScope: 'daily',
  overtimeEnabled: false,
  overtimeRate: 1.5,
  holidayWorkCompensationType: 'cash',
  holidayWorkLeaveMultiplier: 1,
  holidayWorkCashAmount: 100,
  qrRefreshInterval: 30,
  qrCodeRequired: true,
  locationRestriction: 'required',
  locationRadius: 100,
  locations: [
    {
      id: `branch-${Date.now()}`,
      name: 'الفرع الرئيسي',
      lat: '21.4225',
      lon: '39.8262',
    },
  ],
  payrollDay: 28,
  currency: 'ج.م',
  deductionRules: [
    {
        id: `rule-${Date.now()}`,
        fromMinutes: 1,
        toMinutes: 60,
        deductionType: 'day_deduction',
        deductionValue: 0.25
    }
  ],
  earlyLeaveDeductionRules: [
    {
        id: `erule-${Date.now()}`,
        fromMinutes: 1,
        toMinutes: 30,
        deductionType: 'hour_deduction',
        deductionValue: 1
    }
  ],
  fixedDeductions: [
      {
          id: `fixed-${Date.now()}`,
          name: 'تأمينات اجتماعية',
          type: 'fixed',
          value: 300,
          transactionType: 'deduction'
      }
  ],
  deductionForAbsence: 1,
  deductionForIncompleteRecord: 0.5,
};


export default function RegulationsPage() {
    const { toast } = useToast();
    const db = useDb();
    
    const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
    const [initialData, isLoading] = useDbData<GlobalSettings>(settingsRef);
    
    const [settings, setSettings] = useState<Partial<GlobalSettings>>(defaultSettings);

    useEffect(() => {
        if (initialData) {
            const locationsArray: Location[] = Array.isArray(initialData.locations) 
                ? initialData.locations 
                : initialData.locations ? Object.values(initialData.locations).filter((loc): loc is Location => !!(loc as any)?.id) : [];

            const deductionRulesArray: DeductionRule[] = Array.isArray(initialData.deductionRules) 
                ? initialData.deductionRules 
                : initialData.deductionRules ? Object.values(initialData.deductionRules).filter((rule): rule is DeductionRule => !!(rule as any)?.id) : [];
            
            const earlyLeaveDeductionRulesArray: DeductionRule[] = Array.isArray(initialData.earlyLeaveDeductionRules) 
                ? initialData.earlyLeaveDeductionRules 
                : initialData.earlyLeaveDeductionRules ? Object.values(initialData.earlyLeaveDeductionRules).filter((rule): rule is DeductionRule => !!(rule as any)?.id) : [];

            const fixedDeductionsArray: FixedDeduction[] = Array.isArray(initialData.fixedDeductions)
                ? initialData.fixedDeductions
                : initialData.fixedDeductions ? Object.values(initialData.fixedDeductions).filter((item): item is FixedDeduction => !!(item as any)?.id) : [];

            const sanitizedData: GlobalSettings = {
                ...defaultSettings,
                ...initialData,
                locations: locationsArray,
                deductionRules: deductionRulesArray.length > 0 ? deductionRulesArray : defaultSettings.deductionRules,
                earlyLeaveDeductionRules: earlyLeaveDeductionRulesArray.length > 0 ? earlyLeaveDeductionRulesArray : defaultSettings.earlyLeaveDeductionRules,
                fixedDeductions: fixedDeductionsArray.length > 0 ? fixedDeductionsArray : defaultSettings.fixedDeductions,
                lateAllowanceScope: 'daily' 
            };
            setSettings(sanitizedData);
        }
    }, [initialData]);

    const handleSettingChange = (key: keyof GlobalSettings, value: any) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };
    
    const handleDeductionRuleChange = (id: string, key: keyof DeductionRule, value: any, ruleType: 'late' | 'early') => {
        const ruleSet = ruleType === 'late' ? settings.deductionRules : settings.earlyLeaveDeductionRules;
        const updatedRules = (ruleSet || []).map(rule => 
            rule.id === id ? { ...rule, [key]: value } : rule
        );
        handleSettingChange(ruleType === 'late' ? 'deductionRules' : 'earlyLeaveDeductionRules', updatedRules);
    };

    const addNewDeductionRule = (ruleType: 'late' | 'early') => {
        const newId = `rule-${Date.now()}`;
        const currentRules = (ruleType === 'late' ? settings.deductionRules : settings.earlyLeaveDeductionRules) || [];
        
        const sortedRules = [...currentRules].sort((a, b) => a.toMinutes - b.toMinutes);
        const lastRule = sortedRules[sortedRules.length - 1];
        
        const newFromMinutes = lastRule ? lastRule.toMinutes + 1 : 1;

        const newRule: DeductionRule = { 
            id: newId, 
            fromMinutes: newFromMinutes, 
            toMinutes: newFromMinutes + 15, 
            deductionType: 'day_deduction', 
            deductionValue: 0 
        };
        
        const newRules = [...currentRules, newRule];
        handleSettingChange(ruleType === 'late' ? 'deductionRules' : 'earlyLeaveDeductionRules', newRules);
    };

    const removeDeductionRule = (id: string, ruleType: 'late' | 'early') => {
        const ruleSet = ruleType === 'late' ? settings.deductionRules : settings.earlyLeaveDeductionRules;
        const newRules = (ruleSet || []).filter(rule => rule.id !== id);
        handleSettingChange(ruleType === 'late' ? 'deductionRules' : 'earlyLeaveDeductionRules', newRules);
    };

     const handleFixedDeductionChange = (id: string, key: keyof FixedDeduction, value: any) => {
        const updatedItems = (settings.fixedDeductions || []).map(item => 
            item.id === id ? { ...item, [key]: value } : item
        );
        handleSettingChange('fixedDeductions', updatedItems);
    };

    const addNewFixedDeduction = () => {
        const newId = `fixed-${Date.now()}`;
        const newItems = [...(settings.fixedDeductions || []), { id: newId, name: '', type: 'fixed', value: 0, transactionType: 'deduction' }];
        handleSettingChange('fixedDeductions', newItems);
    };

    const removeFixedDeduction = (id: string) => {
        const newItems = (settings.fixedDeductions || []).filter(item => item.id !== id);
        handleSettingChange('fixedDeductions', newItems);
    };


    const handleSaveSettings = async () => {
        if (!db || !settingsRef) {
             toast({
                variant: "destructive",
                title: 'خطأ',
                description: 'لا يمكن الاتصال بقاعدة البيانات.',
            });
            return;
        }
        try {
            await set(settingsRef, settings);
            toast({
                title: 'تم حفظ اللوائح',
                description: 'تم حفظ جميع اللوائح والقواعد بنجاح.',
            });
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: 'خطأ في الحفظ',
                description: error.message || "لم نتمكن من حفظ اللوائح.",
            });
        }
    };

    if (isLoading) {
      return (
         <div className="space-y-8">
            <div>
              <h2 className="text-3xl font-headline font-bold tracking-tight">اللوائح والقواعد</h2>
              <p className="text-muted-foreground">
                هنا يمكنك ضبط لوائح العمل الخاصة بالمؤسسة مثل الحضور والخصومات والغياب.
              </p>
            </div>
            {Array.from({length: 4}).map((_, i) => (
                <Card key={i}>
                    <CardHeader>
                        <Skeleton className="h-7 w-48" />
                        <Skeleton className="h-4 w-64 mt-2" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-10 w-full" />
                    </CardContent>
                </Card>
            ))}
        </div>
      )
    }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-headline font-bold tracking-tight">
          اللوائح والقواعد
        </h2>
        <p className="text-muted-foreground">
          هنا يمكنك ضبط لوائح العمل الخاصة بالمؤسسة مثل الحضور والخصومات والغياب.
        </p>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>رسالة تنبيه للموظفين</CardTitle>
          <CardDescription>
            إدارة التنبيهات العامة التي تظهر للموظفين في شاشة تسجيل الحضور والانصراف.
          </CardDescription>
        </CardHeader>
        <CardContent>
           <div className="space-y-2">
              <Label htmlFor="employee-alert">نص رسالة التنبيه</Label>
              <Textarea
                id="employee-alert"
                placeholder="اكتب هنا رسالة تظهر لجميع الموظفين في شاشة تسجيل الحضور والانصراف..."
                value={settings.employeeAlert || ''}
                onChange={(e) => handleSettingChange('employeeAlert', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                ستظهر هذه الرسالة في أعلى شاشة مسح QR Code. اتركها فارغة لإخفائها.
              </p>
            </div>
        </CardContent>
      </Card>

       <Card>
        <CardHeader>
          <CardTitle>لوائح الحضور والانصراف</CardTitle>
          <CardDescription>
            تحديد قواعد ساعات العمل، التأخير، والعمل الإضافي.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-end">
            <div className="space-y-2">
              <Label htmlFor="work-start-time">بداية وقت العمل الرسمي</Label>
              <Input 
                id="work-start-time" 
                type="time" 
                value={settings.workStartTime || '08:00'}
                onChange={(e) => handleSettingChange('workStartTime', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="work-end-time">نهاية وقت العمل الرسمي</Label>
              <Input 
                id="work-end-time" 
                type="time" 
                value={settings.workEndTime || '16:00'}
                onChange={(e) => handleSettingChange('workEndTime', e.target.value)}
               />
            </div>
            <div className="space-y-2">
              <Label htmlFor="late-allowance">فترة السماح اليومية بالتأخير (دقائق لكل يوم)</Label>
              <Input
                id="late-allowance"
                type="number"
                value={settings.lateAllowance || 15}
                onChange={(e) => handleSettingChange('lateAllowance', parseInt(e.target.value))}
                min="0"
              />
            </div>
          </div>
          <div className="pt-6 space-y-4">
            <div className="flex items-center space-x-2 space-x-reverse">
                <Switch 
                    id="overtime-enabled" 
                    checked={settings.overtimeEnabled || false}
                    onCheckedChange={(checked) => handleSettingChange('overtimeEnabled', checked)}
                />
                <Label htmlFor="overtime-enabled" className="text-base font-medium">
                  تفعيل احتساب الوقت الإضافي
                </Label>
            </div>
            {settings.overtimeEnabled && (
                <Card className="p-4 bg-muted/50 animate-in fade-in">
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div className="space-y-2">
                                <Label htmlFor="overtime-rate">مُعامل احتساب الساعة الإضافية</Label>
                                <Input
                                    id="overtime-rate"
                                    type="number"
                                    value={settings.overtimeRate || 1.5}
                                    onChange={(e) => handleSettingChange('overtimeRate', parseFloat(e.target.value))}
                                    min="1"
                                    step="0.1"
                                />
                                <p className="text-xs text-muted-foreground">
                                    مثال: 1.5 يعني أن الساعة الإضافية تحتسب كساعة ونصف.
                                </p>
                            </div>
                        </div>
                    </div>
                </Card>
            )}
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>تعويض العمل في أيام الإجازات</CardTitle>
          <CardDescription>
            تحديد كيفية تعويض الموظفين عن العمل في أيام إجازاتهم الأسبوعية.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <div className="space-y-2">
                <Label>نوع التعويض</Label>
                <Select
                    dir="rtl"
                    value={settings.holidayWorkCompensationType || 'cash'}
                    onValueChange={(value) => handleSettingChange('holidayWorkCompensationType', value)}
                >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="cash">مبلغ نقدي</SelectItem>
                        <SelectItem value="leave">رصيد إجازات</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {settings.holidayWorkCompensationType === 'cash' && (
                 <div className="space-y-2 animate-in fade-in">
                    <Label htmlFor="holiday-cash-amount">المبلغ النقدي (لكل يوم)</Label>
                    <Input
                        id="holiday-cash-amount"
                        type="number"
                        value={settings.holidayWorkCashAmount || 100}
                        onChange={(e) => handleSettingChange('holidayWorkCashAmount', parseFloat(e.target.value))}
                        min="0"
                    />
                </div>
            )}
             {settings.holidayWorkCompensationType === 'leave' && (
                 <div className="space-y-2 animate-in fade-in">
                    <Label htmlFor="holiday-leave-multiplier">مُضاعِف أيام الإجازة (لكل يوم)</Label>
                    <Input
                        id="holiday-leave-multiplier"
                        type="number"
                        value={settings.holidayWorkLeaveMultiplier || 1}
                        onChange={(e) => handleSettingChange('holidayWorkLeaveMultiplier', parseFloat(e.target.value))}
                        min="0"
                        step="0.5"
                    />
                    <p className="text-xs text-muted-foreground">
                       مثال: 2 يعني أن يوم العمل في الإجازة يعوض بيومين في رصيد الإجازات.
                    </p>
                </div>
            )}
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>لوائح الخصومات والجزاءات للتأخير (تطبيق يومي)</CardTitle>
          <CardDescription>
            يتم تطبيق هذه القواعد على دقائق التأخير لكل يوم بشكل مستقل (بعد خصم السماح اليومي).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
             {(settings.deductionRules || []).map((rule, index) => (
                <div key={rule.id || `rule-${index}`} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 border rounded-lg relative">
                     <div className="absolute top-2 left-2">
                         <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeDeductionRule(rule.id, 'late')}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor={`rule-from-${rule.id}`}>من (دقيقة)</Label>
                        <Input id={`rule-from-${rule.id}`} type="number" value={rule.fromMinutes} onChange={e => handleDeductionRuleChange(rule.id, 'fromMinutes', parseInt(e.target.value), 'late')} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor={`rule-to-${rule.id}`}>إلى (دقيقة)</Label>
                        <Input id={`rule-to-${rule.id}`} type="number" value={rule.toMinutes} onChange={e => handleDeductionRuleChange(rule.id, 'toMinutes', parseInt(e.target.value), 'late')} />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor={`rule-type-${rule.id}`}>نوع الخصم</Label>
                         <Select dir="rtl" value={rule.deductionType} onValueChange={(v) => handleDeductionRuleChange(rule.id, 'deductionType', v, 'late')}>
                            <SelectTrigger id={`rule-type-${rule.id}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="day_deduction">خصم من الأيام</SelectItem>
                                <SelectItem value="hour_deduction">خصم من الساعات</SelectItem>
                                <SelectItem value="minute_deduction">خصم بالدقائق</SelectItem>
                                <SelectItem value="fixed_amount">خصم مبلغ ثابت</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor={`rule-value-${rule.id}`}>قيمة الخصم</Label>
                        <Input id={`rule-value-${rule.id}`} type="number" value={rule.deductionValue} onChange={e => handleDeductionRuleChange(rule.id, 'deductionValue', parseFloat(e.target.value), 'late')} />
                    </div>
                </div>
             ))}
             <Button variant="outline" onClick={() => addNewDeductionRule('late')}>
                <PlusCircle className="ml-2 h-4 w-4" />
                إضافة شريحة خصم تأخير
            </Button>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>لوائح خصومات الانصراف المبكر</CardTitle>
          <CardDescription>
            يتم تطبيق هذه القواعد على دقائق الانصراف المبكر لكل يوم بشكل مستقل.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
             {(settings.earlyLeaveDeductionRules || []).map((rule, index) => (
                <div key={rule.id || `erule-${index}`} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 border rounded-lg relative">
                     <div className="absolute top-2 left-2">
                         <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeDeductionRule(rule.id, 'early')}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor={`erule-from-${rule.id}`}>من (دقيقة)</Label>
                        <Input id={`erule-from-${rule.id}`} type="number" value={rule.fromMinutes} onChange={e => handleDeductionRuleChange(rule.id, 'fromMinutes', parseInt(e.target.value), 'early')} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor={`erule-to-${rule.id}`}>إلى (دقيقة)</Label>
                        <Input id={`erule-to-${rule.id}`} type="number" value={rule.toMinutes} onChange={e => handleDeductionRuleChange(rule.id, 'toMinutes', parseInt(e.target.value), 'early')} />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor={`erule-type-${rule.id}`}>نوع الخصم</Label>
                         <Select dir="rtl" value={rule.deductionType} onValueChange={(v) => handleDeductionRuleChange(rule.id, 'deductionType', v, 'early')}>
                            <SelectTrigger id={`erule-type-${rule.id}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="day_deduction">خصم من الأيام</SelectItem>
                                <SelectItem value="hour_deduction">خصم من الساعات</SelectItem>
                                <SelectItem value="minute_deduction">خصم بالدقائق</SelectItem>
                                <SelectItem value="fixed_amount">خصم مبلغ ثابت</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor={`erule-value-${rule.id}`}>قيمة الخصم</Label>
                        <Input id={`erule-value-${rule.id}`} type="number" value={rule.deductionValue} onChange={e => handleDeductionRuleChange(rule.id, 'deductionValue', parseFloat(e.target.value), 'early')} />
                    </div>
                </div>
             ))}
             <Button variant="outline" onClick={() => addNewDeductionRule('early')}>
                <PlusCircle className="ml-2 h-4 w-4" />
                إضافة شريحة خصم انصراف مبكر
            </Button>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
            <CardTitle>لوائح الغياب والسجلات غير المكتملة</CardTitle>
            <CardDescription>
                تحديد الخصومات التلقائية للغياب أو عدم تسجيل الانصراف.
            </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
                <Label htmlFor="deduction-absence">خصم الغياب (يوم)</Label>
                <Input
                    id="deduction-absence"
                    type="number"
                    value={settings.deductionForAbsence || 1}
                    onChange={(e) => handleSettingChange('deductionForAbsence', parseFloat(e.target.value))}
                    min="0"
                    step="0.1"
                />
                <p className="text-xs text-muted-foreground">
                    عدد الأيام التي ستخصم عن كل يوم غياب.
                </p>
            </div>
            <div className="space-y-2">
                <Label htmlFor="deduction-incomplete">خصم عدم تسجيل الانصراف (يوم)</Label>
                <Input
                    id="deduction-incomplete"
                    type="number"
                    value={settings.deductionForIncompleteRecord || 0.5}
                    onChange={(e) => handleSettingChange('deductionForIncompleteRecord', parseFloat(e.target.value))}
                    min="0"
                    step="0.1"
                />
                 <p className="text-xs text-muted-foreground">
                    عدد الأيام التي ستخصم إذا لم يسجل الموظف انصرافًا.
                </p>
            </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>الخصومات والإضافات الثابتة</CardTitle>
          <CardDescription>
            إدارة البنود الثابتة التي تطبق على جميع الموظفين كل شهر.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
             {(settings.fixedDeductions || []).map((item) => (
                <div key={item.id} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 border rounded-lg relative">
                    <div className="absolute top-2 left-2">
                         <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeFixedDeduction(item.id)}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor={`fixed-name-${item.id}`}>اسم البند</Label>
                        <Input id={`fixed-name-${item.id}`} type="text" value={item.name} onChange={e => handleFixedDeductionChange(item.id, 'name', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor={`fixed-type-${item.id}`}>نوع الحساب</Label>
                        <Select dir="rtl" value={item.type} onValueChange={(v) => handleFixedDeductionChange(item.id, 'type', v)}>
                            <SelectTrigger id={`fixed-type-${item.id}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="fixed">مبلغ ثابت</SelectItem>
                                <SelectItem value="percentage">نسبة من الأساسي</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor={`fixed-value-${item.id}`}>القيمة</Label>
                        <Input id={`fixed-value-${item.id}`} type="number" value={item.value} onChange={e => handleFixedDeductionChange(item.id, 'value', parseFloat(e.target.value))} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor={`fixed-trans-type-${item.id}`}>نوع العملية</Label>
                        <Select dir="rtl" value={item.transactionType} onValueChange={(v) => handleFixedDeductionChange(item.id, 'transactionType', v)}>
                            <SelectTrigger id={`fixed-trans-type-${item.id}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="deduction">خصم</SelectItem>
                                <SelectItem value="addition">إضافة</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
             ))}
             <Button variant="outline" onClick={addNewFixedDeduction}>
                <PlusCircle className="ml-2 h-4 w-4" />
                إضافة بند جديد
            </Button>
        </CardContent>
      </Card>
      
      <div className="flex justify-end">
        <Button size="lg" onClick={handleSaveSettings} className="w-full md:w-auto">
          <Save className="ml-2 h-4 w-4" />
          حفظ جميع اللوائح
        </Button>
      </div>
    </div>
  );
}
