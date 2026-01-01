
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, UserCheck, Filter } from 'lucide-react';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref } from 'firebase/database';
import { useMemo, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import { BarChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, Bar, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format } from 'date-fns';


interface Employee {
  id: string;
  employeeName: string;
  gender: 'male' | 'female';
  locationIds?: string[];
  userStatus: 'Active' | 'Inactive' | 'Pending';
}

interface Location {
  id: string;
  name: string;
}

interface AttendanceRecord {
  employeeId: string;
  date: string;
  checkIn: string;
}

interface GlobalSettings {
    locations: Location[];
}

const GENDER_COLORS = {
  male: 'hsl(var(--chart-2))',   // Blue
  female: 'hsl(var(--chart-5))', // Pink/Red
};

export default function DashboardPage() {
  const db = useDb();
  
  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData, isEmployeesLoading] = useDbData<Record<string, Omit<Employee, 'id'>>>(employeesRef);
  
  const todayStr = format(new Date(), 'yyyy-MM');
  const attendanceRef = useMemoFirebase(() => db ? ref(db, `attendance/${todayStr}`) : null, [db, todayStr]);
  const [attendanceData, isAttendanceLoading] = useDbData<Record<string, Omit<AttendanceRecord, 'id'>>>(attendanceRef);

  const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
  const [settings, isSettingsLoading] = useDbData<GlobalSettings>(settingsRef);


  const [filters, setFilters] = useState({
    location: 'all',
  });
  
  const allLocations: Location[] = useMemo(() => {
    if (!settings?.locations) return [];
    const locationsRaw = Array.isArray(settings.locations) ? settings.locations : Object.values(settings.locations);
    return locationsRaw.filter((loc): loc is Location => typeof loc === 'object' && loc !== null && 'id' in loc && 'name' in loc);
  }, [settings]);

  const allEmployees: Employee[] = useMemo(() => {
    if (!employeesData) return [];
    return Object.entries(employeesData).map(([id, data]) => ({ ...data, id: id }));
  }, [employeesData]);

  const filteredEmployees = useMemo(() => {
      if (filters.location === 'all') return allEmployees;
      return allEmployees.filter(emp => (emp.locationIds || []).includes(filters.location));
  }, [allEmployees, filters.location]);


  const presentTodayIds = useMemo(() => {
      const todayDateStr = new Date().toISOString().split('T')[0];
      if (!attendanceData) return new Set();
      
      const presentIds = new Set<string>();
       Object.values(attendanceData).forEach(rec => {
           if (rec.date === todayDateStr && filteredEmployees.some(e => e.id === rec.employeeId)) {
               presentIds.add(rec.employeeId);
           }
       });

      return presentIds;
  }, [attendanceData, filteredEmployees]);

  
  const genderData = useMemo(() => {
    const activeEmployees = filteredEmployees.filter(emp => emp.userStatus === 'Active');
    const maleCount = activeEmployees.filter(e => e.gender === 'male').length;
    const femaleCount = activeEmployees.filter(e => e.gender === 'female').length;
    return [
      { name: 'ذكور', count: maleCount, fill: GENDER_COLORS.male },
      { name: 'إناث', count: femaleCount, fill: GENDER_COLORS.female },
    ].filter(d => d.count > 0);
  }, [filteredEmployees]);

  const genderByLocationData = useMemo(() => {
      const activeEmployees = allEmployees.filter(emp => emp.userStatus === 'Active');
      const dataByLocation: {[key: string]: {name: string, male: number, female: number}} = {};

      allLocations.forEach(loc => {
          dataByLocation[loc.id] = { name: loc.name, male: 0, female: 0 };
      });
      dataByLocation['unassigned'] = { name: 'غير معين', male: 0, female: 0 };

      activeEmployees.forEach(emp => {
          const locIds = emp.locationIds || [];
          if(locIds.length === 0){
             if (dataByLocation['unassigned']) {
                if (emp.gender === 'male') dataByLocation['unassigned'].male++;
                else if (emp.gender === 'female') dataByLocation['unassigned'].female++;
             }
          } else {
             locIds.forEach(locId => {
                 if (dataByLocation[locId]) {
                    if (emp.gender === 'male') dataByLocation[locId].male++;
                    else if (emp.gender === 'female') dataByLocation[locId].female++;
                }
             })
          }
      });
      
      return Object.values(dataByLocation).filter(d => d.male > 0 || d.female > 0);
  }, [allEmployees, allLocations]);


  const recentActivity = useMemo(() => {
    if (!attendanceData) return [];
    
    return Object.entries(attendanceData)
        .filter(([id, rec]) => filteredEmployees.some(e => e.id === rec.employeeId))
        .map(([id, record]) => {
            const employee = allEmployees.find(e => e.id === record.employeeId);
            return {
                id,
                employeeName: employee?.employeeName || 'غير معروف',
                checkIn: new Date(record.checkIn),
            }
        })
        .sort((a,b) => b.checkIn.getTime() - a.checkIn.getTime())
        .slice(0, 5);
  }, [attendanceData, filteredEmployees, allEmployees]);


  const stats = {
    totalEmployees: filteredEmployees.filter(e => e.userStatus === 'Active').length,
    presentToday: presentTodayIds.size,
  };
  
  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };
  
  const isLoading = isEmployeesLoading || isAttendanceLoading || isSettingsLoading;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            عرض حسب الفرع
          </CardTitle>
        </CardHeader>
        <CardContent>
            <Select
                dir="rtl"
                onValueChange={(value) => handleFilterChange('location', value)}
                defaultValue="all"
            >
            <SelectTrigger>
                <SelectValue placeholder="اختر الفرع" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">كل الفروع</SelectItem>
                {allLocations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                    </SelectItem>
                ))}
            </SelectContent>
            </Select>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الموظفين النشطين</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-1/2" /> : <div className="text-2xl font-bold">{stats.totalEmployees}</div>}
            <p className="text-xs text-muted-foreground">موظف نشط في النظام</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">حضور اليوم</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-1_2" /> : <div className="text-2xl font-bold">{stats.presentToday}</div>}
            <p className="text-xs text-muted-foreground">
              من أصل {stats.totalEmployees} موظف
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="lg:col-span-2">
            <CardHeader>
                <CardTitle>توزيع بالنوع</CardTitle>
            </CardHeader>
            <CardContent>
                {isLoading ? <Skeleton className="h-48 w-full" /> : (
                     <ChartContainer
                        config={{
                            count: {
                                label: "الموظفين",
                            },
                            male: {
                                label: "ذكور",
                                color: "hsl(var(--chart-2))",
                            },
                            female: {
                                label: "إناث",
                                color: "hsl(var(--chart-5))",
                            },
                        }}
                        className="mx-auto aspect-square h-48"
                        >
                        <PieChart>
                            <ChartTooltip
                            cursor={false}
                            content={<ChartTooltipContent hideLabel />}
                            />
                            <Pie
                            data={genderData}
                            dataKey="count"
                            nameKey="name"
                            innerRadius={60}
                            strokeWidth={5}
                            >
                            {genderData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                            </Pie>
                            <ChartLegend
                            content={<ChartLegendContent nameKey="name" />}
                            className="-translate-y-2 flex-wrap gap-2 [&>*]:basis-1/4 [&>*]:justify-center"
                            />
                        </PieChart>
                    </ChartContainer>
                )}
            </CardContent>
        </Card>

        <Card className="lg:col-span-3">
            <CardHeader>
                <CardTitle>النشاطات الأخيرة</CardTitle>
            </CardHeader>
            <CardContent>
                 <Table>
                    <TableHeader>
                        <TableRow>
                        <TableHead className="text-right">اسم الموظف</TableHead>
                        <TableHead className="text-right">وقت الحضور</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading && Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}>
                            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                        </TableRow>
                        ))}
                        {!isLoading && recentActivity.length > 0 ? (
                        recentActivity.map((record) => (
                            <TableRow key={record.id}>
                            <TableCell className="text-right">{record.employeeName}</TableCell>
                            <TableCell className="text-right">{record.checkIn.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: 'numeric' })}</TableCell>
                            </TableRow>
                        ))
                        ) : (
                        <TableRow>
                            <TableCell colSpan={2} className="h-24 text-center">
                            {!isLoading && "لا توجد نشاطات حديثة."}
                            </TableCell>
                        </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
            <CardTitle>توزيع بالنوع حسب الفرع</CardTitle>
        </CardHeader>
        <CardContent>
            {isLoading ? <Skeleton className="h-72 w-full" /> : (
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={genderByLocationData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis allowDecimals={false} />
                        <RechartsTooltip cursor={{fill: 'hsl(var(--muted))'}} contentStyle={{backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}/>
                        <Legend />
                        <Bar dataKey="male" name="ذكور" stackId="a" fill={GENDER_COLORS.male} radius={[4, 4, 0, 0]} />
                        <Bar dataKey="female" name="إناث" stackId="a" fill={GENDER_COLORS.female} radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
