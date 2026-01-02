
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Briefcase, Calendar, Clock } from 'lucide-react';

interface UserProfile {
  employeeName: string;
}

export default function HomePage() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [dateState, setDateState] = useState<Date | null>(null);
  const [isClient, setIsClient] = useState(false);


  useEffect(() => {
    setIsClient(true);
    const storedProfile = localStorage.getItem('userProfile');
    if (storedProfile) {
      setUserProfile(JSON.parse(storedProfile));
    }
    setDateState(new Date());
    const timer = setInterval(() => setDateState(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  
  const welcomeMessage = () => {
      const hour = new Date().getHours();
      if (hour < 12) return 'صباح الخير';
      if (hour < 18) return 'يوم سعيد';
      return 'مساء الخير';
  }

  return (
    <div className="space-y-8">
       <div className="flex items-center justify-between space-y-2">
           <div>
                {userProfile ? (
                    <h2 className="text-3xl font-bold tracking-tight font-headline">
                        {welcomeMessage()}, {userProfile.employeeName}!
                    </h2>
                ) : (
                    <Skeleton className="h-10 w-64" />
                )}
                 <p className="text-muted-foreground">
                    نظرة عامة على يومك والمهام الحالية
                </p>
           </div>
            <div className="flex items-center space-x-2 space-x-reverse text-right">
                {isClient && dateState ? (
                    <>
                        <div className="p-2 bg-muted rounded-md">
                            <p className="text-lg font-semibold">{dateState.toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'long' })}</p>
                            <p className="text-xs text-muted-foreground">{dateState.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long' })}</p>
                        </div>
                        <div className="p-2 bg-muted rounded-md">
                            <p className="text-lg font-semibold">{dateState.toLocaleString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
                            <p className="text-xs text-muted-foreground">التوقيت المحلي</p>
                        </div>
                    </>
                ) : (
                    <>
                        <Skeleton className="h-16 w-24" />
                        <Skeleton className="h-16 w-24" />
                    </>
                )}
            </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              حالة الحضور
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">لم يتم التسجيل</div>
            <p className="text-xs text-muted-foreground">
              لم تسجل حضورك لهذا اليوم بعد
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              مجموع التأخيرات
            </CardTitle>
             <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0 دقيقة</div>
            <p className="text-xs text-muted-foreground">
              هذا الشهر
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">طلبات معلقة</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">
              لديك 0 طلب إجازة أو مأمورية قيد المراجعة
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">أيام الإجازة المتبقية</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">
              من رصيد الإجازات السنوي
            </p>
          </CardContent>
        </Card>
      </div>

       <Card>
            <CardHeader>
                <CardTitle>الإعلانات والمهام</CardTitle>
                 <CardDescription>آخر التحديثات والملاحظات من الإدارة</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">لا توجد إعلانات جديدة في الوقت الحالي.</p>
            </CardContent>
        </Card>

    </div>
  );
}
