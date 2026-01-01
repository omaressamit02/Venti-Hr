'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, push, set, query, type Query } from 'firebase/database';
import { useToast } from '@/hooks/use-toast';
import { Map, Send, Loader2, RefreshCw, Filter } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';


interface UserProfile {
  id: string;
  employeeName: string;
}

const visitSchema = z.object({
  notes: z.string().min(1, { message: 'الملاحظات مطلوبة.' }),
});

type VisitFormData = z.infer<typeof visitSchema>;

interface VisitRecord {
  id: string;
  timestamp: string;
  notes: string;
  location: {
    lat: number;
    lon: number;
  };
}

export default function VisitsPage() {
  const { toast } = useToast();
  const db = useDb();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshingLocation, setIsRefreshingLocation] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    fromDate: '',
    toDate: '',
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<VisitFormData>({
    resolver: zodResolver(visitSchema),
  });

  const fetchLocation = () => {
      setIsRefreshingLocation(true);
      setLocationError(null);
      if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
              (position) => {
                  setLocation({ lat: position.coords.latitude, lon: position.coords.longitude });
                  setIsRefreshingLocation(false);
              },
              () => {
                  setLocationError('لا يمكن الوصول للموقع. الرجاء التأكد من تفعيل خدمات الموقع.');
                  setIsRefreshingLocation(false);
              },
              { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
          );
      } else {
          setLocationError('خدمات الموقع غير مدعومة في هذا المتصفح.');
          setIsRefreshingLocation(false);
      }
  };

  useEffect(() => {
    const storedProfile = localStorage.getItem('userProfile');
    if (storedProfile) {
      setUserProfile(JSON.parse(storedProfile));
    }
    fetchLocation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const userVisitsQuery: Query | null = useMemoFirebase(() => {
    if (!db || !userProfile?.id) return null;
    return query(ref(db, `visits/${userProfile.id}`));
  }, [db, userProfile]);

  const [visitsData, isLoading] = useDbData<Record<string, Omit<VisitRecord, 'id'>>>(userVisitsQuery);
  
  const allVisits: VisitRecord[] = useMemo(() => {
    if(!visitsData) return [];
    return Object.entries(visitsData)
        .map(([id, visit]) => ({ ...visit, id }))
        .sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [visitsData]);

  const filteredVisits = useMemo(() => {
    return allVisits.filter(visit => {
      const visitDate = new Date(visit.timestamp);
      if (filters.fromDate && visitDate < new Date(filters.fromDate)) return false;
      if (filters.toDate) {
          const toDate = new Date(filters.toDate);
          toDate.setDate(toDate.getDate() + 1); // Include the whole day
          if (visitDate >= toDate) return false;
      }
      return true;
    });
  }, [allVisits, filters]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const onSubmit = async (data: VisitFormData) => {
    if (!db || !userProfile || !location) {
      toast({
        variant: 'destructive',
        title: 'خطأ',
        description: 'لا يمكن تسجيل الزيارة. بيانات المستخدم أو الموقع غير مكتملة.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const newVisitRef = push(ref(db, `visits/${userProfile.id}`));
      await set(newVisitRef, {
        employeeId: userProfile.id,
        employeeName: userProfile.employeeName,
        timestamp: new Date().toISOString(),
        notes: data.notes,
        location: location,
      });
      toast({
        title: 'تم تسجيل الزيارة بنجاح',
      });
      reset();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'فشل تسجيل الزيارة',
        description: 'حدث خطأ ما، يرجى المحاولة مرة أخرى.',
      });
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-headline font-bold tracking-tight">
        تسجيل الزيارات الميدانية
      </h2>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Map className="h-6 w-6" />
            تسجيل زيارة جديدة
          </CardTitle>
          <CardDescription>
            اكتب ملاحظاتك حول الزيارة. سيتم تسجيل موقعك الحالي تلقائيًا.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            
            {locationError && (
                <Alert variant="destructive">
                    <AlertTitle>خطأ في تحديد الموقع</AlertTitle>
                    <AlertDescription>{locationError}</AlertDescription>
                </Alert>
            )}

            <div>
              <Label htmlFor="notes">الملاحظات</Label>
              <Textarea
                id="notes"
                placeholder="اكتب تفاصيل الزيارة، المهمة، أو سبب التواجد هنا..."
                {...register('notes')}
              />
              {errors.notes && (
                <p className="text-sm text-red-500 mt-1">{errors.notes.message}</p>
              )}
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting || !location || !!locationError}>
                {isSubmitting ? (
                    <><Loader2 className="ml-2 h-4 w-4 animate-spin" /> جاري التسجيل...</>
                ) : (
                    <><Send className="ml-2 h-4 w-4" /> تسجيل الزيارة</>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>سجل زياراتي</CardTitle>
           <CardDescription className="pt-4">
            <div className="flex items-center gap-2 pb-2">
                <Filter className="h-5 w-5" />
                <h3 className="text-base font-semibold">فلترة السجل</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="from-date">من تاريخ</Label>
                    <Input id="from-date" type="date" onChange={e => handleFilterChange('fromDate', e.target.value)} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="to-date">إلى تاريخ</Label>
                    <Input id="to-date" type="date" onChange={e => handleFilterChange('toDate', e.target.value)} />
                </div>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent>
           <div className="space-y-4">
            {isLoading && Array.from({length: 3}).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full"/></CardContent></Card>)}
            {!isLoading && filteredVisits.length > 0 ? (
                filteredVisits.map((visit) => (
                    <Card key={visit.id}>
                        <CardContent className="p-4 space-y-2 text-sm">
                             <div className="flex justify-between items-center">
                                <span className="font-semibold text-base">{new Date(visit.timestamp).toLocaleString('ar-EG')}</span>
                            </div>
                            <p className="text-muted-foreground pt-2 border-t mt-2">{visit.notes}</p>
                        </CardContent>
                    </Card>
                ))
            ) : (
                <div className="h-24 text-center flex items-center justify-center">
                    {isLoading ? 'جاري تحميل الزيارات...' : 'لم تقم بتسجيل أي زيارات في هذه الفترة.'}
                </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
