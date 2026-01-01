
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref } from 'firebase/database';
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
import { Filter, Map } from 'lucide-react';
import { format } from 'date-fns';

interface Employee {
  id: string;
  employeeName: string;
}

interface Visit {
  id: string;
  employeeId: string;
  employeeName: string;
  timestamp: string;
  notes: string;
  location: {
    lat: number;
    lon: number;
  };
}

export default function AdminVisitsPage() {
  const db = useDb();

  const visitsRef = useMemoFirebase(() => db ? ref(db, 'visits') : null, [db]);
  const [visitsData, isVisitsLoading] = useDbData<Record<string, Record<string, Omit<Visit, 'id' | 'employeeId'>>>>(visitsRef);

  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData, isEmployeesLoading] = useDbData<Record<string, Employee>>(employeesRef);

  const [filters, setFilters] = useState({
    employee: 'all',
    fromDate: '',
    toDate: '',
    searchTerm: '',
  });

  const allVisitsData = useMemo(() => {
    if (!visitsData) return [];
    
    const allVisits: Visit[] = [];

    Object.entries(visitsData).forEach(([employeeId, employeeVisits]) => {
        Object.entries(employeeVisits).forEach(([visitId, visit]) => {
            allVisits.push({
                ...visit,
                id: visitId,
                employeeId,
            });
        });
    });
    return allVisits.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [visitsData]);

  const filteredVisits = useMemo(() => {
    return allVisitsData.filter(visit => {
        const visitDate = new Date(visit.timestamp);
        if (filters.employee !== 'all' && visit.employeeId !== filters.employee) return false;
        if (filters.fromDate && visitDate < new Date(filters.fromDate)) return false;
        if (filters.toDate) {
            const toDate = new Date(filters.toDate);
            toDate.setDate(toDate.getDate() + 1);
            if (visitDate > toDate) return false;
        }
        if (filters.searchTerm && !visit.notes?.toLowerCase().includes(filters.searchTerm.toLowerCase())) return false;

        return true;
    });
  }, [allVisitsData, filters]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const employeesList: (Employee & { id: string })[] = useMemo(() => {
    if (!employeesData) return [];
    return Object.entries(employeesData).map(([id, data]) => ({ ...data, id }));
  }, [employeesData]);

  const isLoading = isVisitsLoading || isEmployeesLoading;

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-headline font-bold tracking-tight">
        مراجعة زيارات الموظفين
      </h2>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-6 w-6" />
            فلترة الزيارات
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
              <Label htmlFor="from-date">من تاريخ</Label>
              <Input id="from-date" type="date" onChange={e => handleFilterChange('fromDate', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to-date">إلى تاريخ</Label>
              <Input id="to-date" type="date" onChange={e => handleFilterChange('toDate', e.target.value)} />
            </div>
             <div className="space-y-2">
              <Label htmlFor="search-term">بحث في الملاحظات</Label>
              <Input 
                id="search-term"
                placeholder="اكتب كلمة للبحث..."
                value={filters.searchTerm}
                onChange={e => handleFilterChange('searchTerm', e.target.value)} 
              />
            </div>
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle>قائمة الزيارات المسجلة</CardTitle>
        </CardHeader>
        <CardContent>
        {/* Desktop Table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">اسم الموظف</TableHead>
                  <TableHead className="text-right">الوقت والتاريخ</TableHead>
                  <TableHead className="text-right">الملاحظات</TableHead>
                  <TableHead className="text-center">الموقع</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && Array.from({length: 5}).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={4}><Skeleton className="w-full h-8" /></TableCell>
                  </TableRow>
                ))}
                {!isLoading && filteredVisits.length > 0 ? (
                  filteredVisits.map((visit) => (
                    <TableRow key={visit.id}>
                      <TableCell className="font-medium text-right">{visit.employeeName}</TableCell>
                      <TableCell className="text-right">{new Date(visit.timestamp).toLocaleString('ar-EG')}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{visit.notes || '-'}</TableCell>
                       <TableCell className="text-center">
                            <Button size="sm" variant="outline" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${visit.location.lat},${visit.location.lon}`, '_blank')}>
                                <Map className="ml-2 h-4 w-4"/>
                                عرض على الخريطة
                            </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      {isLoading ? 'جاري تحميل الزيارات...' : 'لا توجد زيارات لعرضها حسب الفلتر المحدد.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {/* Mobile Cards */}
          <div className="space-y-4 md:hidden">
            {isLoading && Array.from({length: 3}).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full"/></CardContent></Card>)}
            {!isLoading && filteredVisits.length > 0 ? (
                filteredVisits.map((visit) => (
                    <Card key={visit.id}>
                        <CardHeader className="p-4">
                            <CardTitle className="text-base">{visit.employeeName}</CardTitle>
                             <CardDescription>{new Date(visit.timestamp).toLocaleString('ar-EG')}</CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 pt-0 space-y-4 text-sm">
                             <p className="text-muted-foreground">{visit.notes}</p>
                             <Button size="sm" className="w-full" variant="secondary" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${visit.location.lat},${visit.location.lon}`, '_blank')}>
                                <Map className="ml-2 h-4 w-4"/>
                                عرض الموقع على الخريطة
                            </Button>
                        </CardContent>
                    </Card>
                ))
            ) : (
                <div className="h-24 text-center flex items-center justify-center">
                    {isLoading ? 'جاري تحميل الزيارات...' : 'لا توجد زيارات لعرضها.'}
                </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
