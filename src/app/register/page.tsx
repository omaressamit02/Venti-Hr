
'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useState, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { ref, push, set, query, orderByChild, equalTo, get } from 'firebase/database';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';

type Location = {
  id: string;
  name: string;
};

type GlobalSettings = {
    locations: Location[];
};

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const db = useDb();

  const [employeeName, setEmployeeName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [gender, setGender] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
  const [settings, isSettingsLoading] = useDbData<GlobalSettings>(settingsRef);
  
  const locations = settings?.locations && Array.isArray(settings.locations)
      ? settings.locations
      : settings?.locations && typeof settings.locations === 'object'
      ? Object.values(settings.locations)
      : [];

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!db) {
      toast({
        variant: 'destructive',
        title: 'خطأ',
        description: 'لا يمكن الاتصال بقاعدة البيانات.',
      });
      return;
    }
    
    if (phoneNumber.length !== 11) {
        toast({
            variant: 'destructive',
            title: 'رقم هاتف غير صالح',
            description: 'الرجاء التأكد من أن رقم الهاتف يتكون من 11 رقمًا.',
        });
        return;
    }

    if (password.length < 6) {
        toast({
            variant: 'destructive',
            title: 'كلمة مرور ضعيفة',
            description: 'يجب أن تكون كلمة المرور 6 أحرف على الأقل.',
        });
        return;
    }
    
    if (!gender || locationIds.length === 0) {
        toast({
            variant: 'destructive',
            title: 'بيانات غير مكتملة',
            description: 'الرجاء اختيار الجنس وفرع واحد على الأقل.',
        });
        return;
    }

    setIsLoading(true);

    try {
      // Check if phone number already exists
      const employeesRef = ref(db, 'employees');
      const phoneQuery = query(employeesRef, orderByChild('phoneNumber'), equalTo(phoneNumber));
      const snapshot = await get(phoneQuery);

      if (snapshot.exists()) {
        const existingUserData = Object.values(snapshot.val())[0] as { userStatus: string };
        toast({
          variant: 'destructive',
          title: 'رقم هاتف مسجل بالفعل',
          description: `هذا الرقم مسجل لحساب حالته: ${existingUserData.userStatus}`,
        });
        setIsLoading(false);
        return;
      }
      
      const newEmployeeRef = push(ref(db, 'employees'));
      
      const newEmployeeData = {
        employeeName,
        employeeCode: `EMP-${Math.floor(1000 + Math.random() * 9000)}`, // Temporary code
        phoneNumber,
        password,
        gender,
        birthDate,
        locationIds,
        userStatus: 'Pending', // Status is pending until admin approval
        permissions: ['/home', '/attendance', '/scanner', '/requests', '/visits'],
        salary: 0,
        shiftConfiguration: 'general',
        deviceId: null,
      };

      await set(newEmployeeRef, newEmployeeData);

      toast({
        title: 'تم التسجيل بنجاح',
        description: 'تم إرسال طلبك. سيقوم المدير بمراجعته وتفعيله.',
      });
      router.push('/');
    } catch (error: any) {
      console.error('Registration Error:', error);
      toast({
        variant: 'destructive',
        title: 'فشل التسجيل',
        description: error.message || 'حدث خطأ غير متوقع. حاول مرة أخرى.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-sm mx-auto shadow-2xl bg-card">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-3xl font-headline text-primary">
            إنشاء حساب جديد
          </CardTitle>
          <CardDescription>أدخل بياناتك لإنشاء حساب موظف</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="employee-name">الاسم الكامل</Label>
              <Input
                id="employee-name"
                type="text"
                placeholder="أدخل اسمك الثلاثي"
                required
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone-number">رقم الهاتف</Label>
              <Input
                id="phone-number"
                type="tel"
                placeholder="01xxxxxxxxx"
                required
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                placeholder="أدخل كلمة مرور قوية"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="birth-date">تاريخ الميلاد</Label>
              <Input
                id="birth-date"
                type="date"
                required
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>الجنس</Label>
              <RadioGroup dir="rtl" onValueChange={setGender} value={gender} className="flex gap-4">
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="male" id="male" />
                  <Label htmlFor="male">ذكر</Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="female" id="female" />
                  <Label htmlFor="female">أنثى</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-2">
                <Label htmlFor="location">الفرع</Label>
                 {isSettingsLoading ? <Skeleton className="h-10 w-full" /> : (
                    <Select dir="rtl" onValueChange={(value) => setLocationIds([value])} value={locationIds[0]}>
                        <SelectTrigger id="location">
                            <SelectValue placeholder="اختر الفرع" />
                        </SelectTrigger>
                        <SelectContent>
                            {locations.map((loc) => (
                                <SelectItem key={loc.id} value={loc.id}>
                                {loc.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                 )}
            </div>

            <Button type="submit" className="w-full" disabled={isLoading || isSettingsLoading}>
              {isLoading ? 'جاري التسجيل...' : 'إنشاء الحساب'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center text-sm">
            <Link href="/" className="text-primary hover:underline">
                لديك حساب بالفعل؟ تسجيل الدخول
            </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
