
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Search, FileSpreadsheet, LockKeyhole, Eye, EyeOff } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Employee {
  id: string;
  employeeName: string;
  employeeCode: string;
  password?: string;
  userStatus: 'Active' | 'Inactive' | 'Pending' | 'Archived';
}

export default function PasswordReportPage() {
  const db = useDb();
  const [searchTerm, setSearchTerm] = useState('');
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData, isLoading] = useDbData<Record<string, Employee>>(employeesRef);

  const allEmployees = useMemo(() => {
    if (!employeesData) return [];
    return Object.entries(employeesData).map(([id, emp]) => ({ ...emp, id }));
  }, [employeesData]);

  const filteredEmployees = useMemo(() => {
    return allEmployees.filter(emp => 
      emp.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employeeCode.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allEmployees, searchTerm]);

  const togglePasswordVisibility = (id: string) => {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleExportToExcel = () => {
    const dataToExport = filteredEmployees.map(emp => ({
      'اسم الموظف': emp.employeeName,
      'كود الموظف (اسم المستخدم)': emp.employeeCode,
      'كلمة المرور': emp.password || 'غير محددة',
      'الحالة': emp.userStatus
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'بيانات الدخول');
    XLSX.writeFile(workbook, `Employee_Passwords_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <h2 className="text-3xl font-headline font-bold tracking-tight flex items-center gap-2">
          <LockKeyhole className="h-8 w-8 text-primary" />
          تقرير بيانات الدخول
        </h2>
        <Button onClick={handleExportToExcel} variant="outline" disabled={isLoading || filteredEmployees.length === 0}>
          <FileSpreadsheet className="ml-2 h-4 w-4" />
          تصدير Excel
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>البحث في الموظفين</CardTitle>
          <CardDescription>عرض أسماء المستخدمين وكلمات المرور لتسهيل دعم الموظفين في حالة النسيان.</CardDescription>
          <div className="pt-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="ابحث بالاسم أو كود الموظف..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">اسم الموظف</TableHead>
                  <TableHead className="text-right">اسم المستخدم (الكود)</TableHead>
                  <TableHead className="text-right">كلمة المرور</TableHead>
                  <TableHead className="text-center">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8 rounded-full mx-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredEmployees.length > 0 ? (
                  filteredEmployees.map((emp) => (
                    <TableRow key={emp.id}>
                      <TableCell className="font-medium text-right">{emp.employeeName}</TableCell>
                      <TableCell className="text-right font-mono">{emp.employeeCode}</TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono bg-muted px-2 py-1 rounded">
                          {showPasswords[emp.id] ? (emp.password || '---') : '••••••••'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => togglePasswordVisibility(emp.id)}
                          title={showPasswords[emp.id] ? "إخفاء" : "إظهار"}
                        >
                          {showPasswords[emp.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      لم يتم العثور على موظفين.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
