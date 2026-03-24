
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
import { Save, MapPin, PlusCircle, Trash2, Loader2, Map as MapIcon, AlertTriangle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, set, update } from 'firebase/database';
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
    toMinutes: number;
    deductionType: 'day_deduction' | 'fixed_amount';
    deductionValue: number;
};

type GlobalSettings = {
    companyName: string;
    employeeAlert?: string;
    workStartTime: string;
    workEndTime: string;
    lateAllowance: number;
    lateAllowanceScope?: 'daily' | 'monthly';
    overtimeEnabled: boolean;
    qrCodeRequired: boolean;
    qrLocationCheckRequired: boolean;
    qrRefreshInterval: number;
    locationRestriction: string;
    locationRadius: number;
    locations: Location[];
    payrollDay: number;
    currency: string;
    deductionRules?: DeductionRule[];
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
  qrCodeRequired: true,
  qrLocationCheckRequired: true,
  qrRefreshInterval: 30,
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
        toMinutes: 60,
        deductionType: 'day_deduction',
        deductionValue: 0.5
    }
  ],
  deductionForAbsence: 1,
  deductionForIncompleteRecord: 0.5,
};


export default function SettingsPage() {
    const { toast } = useToast();
    const db = useDb();
    
    const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
    const [initialData, isLoading] = useDbData<GlobalSettings>(settingsRef);
    
    const [settings, setSettings] = useState<Partial<GlobalSettings>>(defaultSettings);
    const [isUpdatingLocation, setIsUpdatingLocation] = useState<string | null>(null);


    useEffect(() => {
        if (initialData) {
            // Firebase RTDB can return arrays as objects with integer keys, so we must convert them.
            const locationsArray: Location[] = Array.isArray(initialData.locations) 
                ? initialData.locations 
                : initialData.locations ? Object.values(initialData.locations).filter((loc): loc is Location => !!(loc as any)?.id) : [];

            const deductionRulesArray: DeductionRule[] = Array.isArray(initialData.deductionRules) 
                ? initialData.deductionRules 
                : initialData.deductionRules ? Object.values(initialData.deductionRules).filter((rule): rule is DeductionRule => !!(rule as any)?.id) : [];

            const sanitizedData: GlobalSettings = {
                ...defaultSettings,
                ...initialData,
                locations: locationsArray,
                deductionRules: deductionRulesArray.length > 0 ? deductionRulesArray : defaultSettings.deductionRules,
            };
            setSettings(sanitizedData);
        }
    }, [initialData]);

    const handleSettingChange = (key: keyof GlobalSettings, value: any) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleLocationChange = (id: string, field: 'name' | 'lat' | 'lon', value: string) => {
        if ((field === 'lat' || field === 'lon') && value.includes(',')) {
            const parts = value.split(',').map(part => part.trim());
            if (parts.length === 2 && !isNaN(parseFloat(parts[0])) && !isNaN(parseFloat(parts[1]))) {
                const [lat, lon] = parts;
                const updatedLocations = (settings.locations || []).map(loc => 
                    loc.id === id ? { ...loc, lat, lon } : loc
                );
                handleSettingChange('locations', updatedLocations);
                return;
            }
        }

        const updatedLocations = (settings.locations || []).map(loc => 
            loc.id === id ? { ...loc, [field]: value } : loc
        );
        handleSettingChange('locations', updatedLocations);
    };

    const addNewLocation = () => {
        const newId = `branch-${Date.now()}`;
        const newLocations = [...(settings.locations || []), { id: newId, name: '', lat: '', lon: '' }];
        handleSettingChange('locations', newLocations);
    };

    const removeLocation = (id: string) => {
        const newLocations = (settings.locations || []).filter(loc => loc.id !== id);
        handleSettingChange('locations', newLocations);
    };
    
    const handleSetCurrentLocation = (id: string) => {
        setIsUpdatingLocation(id);
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                const updatedLocations = (settings.locations || []).map(loc => 
                    loc.id === id ? { ...loc, lat: latitude.toString(), lon: longitude.toString() } : loc
                );
                handleSettingChange('locations', updatedLocations);
                toast({
                    title: 'تم تحديث الإحداثيات',
                    description: 'تم تعبئة حقول الموقع بنجاح. اضغط على حفظ لحفظ التغييرات.',
                });
                setIsUpdatingLocation(null);
            },
            () => {
                toast({
                    variant: "destructive",
                    title: 'خطأ في تحديد الموقع',
                    description: 'لم نتمكن من الحصول على موقعك الحالي. يرجى التأكد من أنك أعطيت الإذن اللازم.',
                });
                setIsUpdatingLocation(null);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
             toast({
                variant: "destructive",
                title: 'خدمات الموقع غير مدعومة',
                description: 'خدمات الموقع الجغرافي غير مدعومة في هذا المتصفح.',
            });
            setIsUpdatingLocation(null);
        }
    };
    
    const handleSaveLocation = async (locationId: string) => {
        if (!db || !settingsRef) {
            toast({ variant: "destructive", title: "خطأ", description: "لا يمكن الاتصال بقاعدة البيانات."});
            return;
        }

        const locationToSave = (settings.locations || []).find(loc => loc.id === locationId);
        if (!locationToSave) {
             toast({ variant: "destructive", title: "خطأ", description: "لم يتم العثور على الفرع."});
            return;
        }

        try {
            const locationIndex = initialData?.locations?.findIndex(loc => loc && loc.id === locationId) ?? -1;

            if (locationIndex === -1) {
                 await set(settingsRef, settings);
            } else {
                const locationPath = `global_settings/main/locations/${locationIndex}`;
                await update(ref(db), { [locationPath]: locationToSave });
            }
           
            toast({ title: "تم حفظ الفرع", description: `تم حفظ بيانات فرع "${locationToSave.name}" بنجاح.` });
        } catch (error: any) {
            toast({ variant: "destructive", title: "فشل الحفظ", description: error.message });
        }
    };

    const handleSaveAllSettings = async () => {
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
                title: 'تم حفظ الإعدادات',
                description: 'تم حفظ جميع الإعدادات بنجاح.',
            });
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: 'خطأ في الحفظ',
                description: error.message || "لم نتمكن من حفظ الإعدادات.",
            });
        }
    };

    if (isLoading) {
      return (
         <div className="space-y-8">
            <div>
              <h2 className="text-3xl font-headline font-bold tracking-tight">الإعدادات الفنية</h2>
              <p className="text-muted-foreground">
                هنا يمكنك ضبط الإعدادات الفنية والتكوينات العامة للنظام.
              </p>
            </div>
            {Array.from({length: 3}).map((_, i) => (
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
          الإعدادات الفنية
        </h2>
        <p className="text-muted-foreground">
           هنا يمكنك ضبط الإعدادات الفنية والتكوينات العامة للنظام.
        </p>
      </div>

       <Card>
        <CardHeader>
          <CardTitle>إعدادات الشركة العامة</CardTitle>
          <CardDescription>
            إدارة المعلومات الأساسية لشركتك.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="company-name">اسم الشركة</Label>
              <Input 
                id="company-name" 
                value={settings.companyName || ''}
                onChange={(e) => handleSettingChange('companyName', e.target.value)}
              />
            </div>
             <div className="space-y-2">
              <Label htmlFor="company-logo">شعار الشركة</Label>
              <Input id="company-logo" type="file" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>إعدادات مسح QR Code والمواقع</CardTitle>
          <CardDescription>
            تحديد آلية عمل وتأمين رمز الحضور وتقييد المواقع الجغرافية للفروع.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <Label htmlFor="qr-code-required">إلزام استخدام QR Code</Label>
                  <p className="text-xs text-muted-foreground">يجب مسح الكود لتسجيل الحضور</p>
                </div>
                <Switch 
                    id="qr-code-required" 
                    checked={settings.qrCodeRequired ?? true}
                    onCheckedChange={(checked) => handleSettingChange('qrCodeRequired', checked)}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <Label htmlFor="qr-location-check">إلزام فحص الموقع عند مسح QR</Label>
                  <p className="text-xs text-muted-foreground">التأكد من تواجد الموظف بالفرع أثناء المسح</p>
                </div>
                <Switch 
                    id="qr-location-check" 
                    checked={settings.qrLocationCheckRequired ?? true}
                    onCheckedChange={(checked) => handleSettingChange('qrLocationCheckRequired', checked)}
                />
              </div>
           </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
             <div className="space-y-2">
              <Label htmlFor="qr-refresh-interval">
                معدل تحديث الرمز (ثواني)
              </Label>
              <Input
                id="qr-refresh-interval"
                type="number"
                value={settings.qrRefreshInterval || 30}
                onChange={(e) => handleSettingChange('qrRefreshInterval', parseInt(e.target.value))}
                min="10"
                disabled={!settings.qrCodeRequired}
              />
            </div>
            <div className="space-y-2">
                <Label htmlFor="location-restriction">تقييد الموقع الجغرافي العام</Label>
                 <Select 
                    dir="rtl" 
                    value={settings.locationRestriction || 'required'}
                    onValueChange={(value) => handleSettingChange('locationRestriction', value)}
                 >
                    <SelectTrigger id="location-restriction">
                        <SelectValue placeholder="اختر نوع التقييد" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="required">مطلوب (تسجيل إلزامي)</SelectItem>
                        <SelectItem value="optional">اختياري (تسجيل مع تحذير)</SelectItem>
                        <SelectItem value="none">غير مطلوب</SelectItem>
                    </SelectContent>
                </Select>
            </div>
             <div className="space-y-2 md:col-span-2">
                <Label htmlFor="location-radius">نطاق الموقع المسموح به (متر)</Label>
                <Input 
                    id="location-radius" 
                    type="number" 
                    value={settings.locationRadius || 100}
                    onChange={(e) => handleSettingChange('locationRadius', parseInt(e.target.value))}
                    min="10"
                />
            </div>
          </div>
          <div className="space-y-4 pt-4">
            <Label className="text-base font-medium">مواقع الفروع المعتمدة</Label>
            {(settings.locations || []).map((location, index) => (
                <div key={location.id || `loc-${index}`} className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 border rounded-lg relative">
                    <div className="absolute top-2 left-2">
                         <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeLocation(location.id)}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="space-y-2 col-span-full">
                        <Label htmlFor={`loc-name-${location.id}`}>اسم الموقع/الفرع</Label>
                        <Input id={`loc-name-${location.id}`} type="text" placeholder="مثال: الفرع الرئيسي" value={location.name} onChange={e => handleLocationChange(location.id, 'name', e.target.value)} />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor={`loc-lat-${location.id}`}>خط العرض (Latitude)</Label>
                        <Input id={`loc-lat-${location.id}`} type="text" placeholder="e.g. 21.4225" value={location.lat} onChange={e => handleLocationChange(location.id, 'lat', e.target.value)} />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor={`loc-lon-${location.id}`}>خط الطول (Longitude)</Label>
                        <Input id={`loc-lon-${location.id}`} type="text" placeholder="e.g. 39.8262" value={location.lon} onChange={e => handleLocationChange(location.id, 'lon', e.target.value)} />
                    </div>
                     <div className="grid grid-cols-1 sm:grid-cols-3 col-span-full gap-2">
                         <Button 
                            variant="outline" 
                            onClick={() => handleSetCurrentLocation(location.id)}
                            disabled={isUpdatingLocation === location.id}
                        >
                            {isUpdatingLocation === location.id ? (
                                <>
                                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                                    جاري التحديث...
                                </>
                            ) : (
                                <>
                                    <MapPin className="ml-2 h-4 w-4" />
                                    تعبئة من الموقع الحالي
                                </>
                            )}
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lon}`, '_blank')}
                            disabled={!location.lat || !location.lon}
                        >
                            <MapIcon className="ml-2 h-4 w-4" />
                            عرض على الخريطة
                        </Button>
                         <Button
                            onClick={() => handleSaveLocation(location.id)}
                        >
                            <Save className="ml-2 h-4 w-4" />
                            حفظ هذا الفرع
                        </Button>
                    </div>
                </div>
            ))}
            <Button variant="outline" onClick={addNewLocation}>
                <PlusCircle className="ml-2 h-4 w-4" />
                إضافة فرع جديد
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>إعدادات الرواتب</CardTitle>
          <CardDescription>
            ضبط الإعدادات الخاصة بحساب وصرف الرواتب الشهرية.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="payroll-day">يوم صرف الراتب من كل شهر</Label>
              <Input
                id="payroll-day"
                type="number"
                value={settings.payrollDay || 28}
                onChange={(e) => handleSettingChange('payrollDay', parseInt(e.target.value))}
                min="1"
                max="31"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">عملة الرواتب</Label>              
              <Input 
                id="currency" 
                value={settings.currency || 'ج.م'}
                onChange={(e) => handleSettingChange('currency', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" onClick={handleSaveAllSettings} className="w-full md:w-auto">
          <Save className="ml-2 h-4 w-4" />
          حفظ جميع الإعدادات
        </Button>
      </div>
    </div>
  );
}
