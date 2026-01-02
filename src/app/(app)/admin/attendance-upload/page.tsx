// This is a placeholder file. You can add the UI for attendance upload here.
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import readXlsxFile from 'read-excel-file'
import { useDb } from "@/firebase";
import { ref, update, push, serverTimestamp } from "firebase/database";


export default function AttendanceUploadPage() {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const db = useDb();

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            toast({ variant: 'destructive', title: 'لم يتم اختيار ملف' });
            return;
        }

        setIsLoading(true);
        try {
            const rows = await readXlsxFile(file);
            if (rows.length < 2) {
                toast({ variant: 'destructive', title: 'الملف فارغ أو يحتوي على صف الرأس فقط' });
                return;
            }

            // Assuming headers are: EmployeeCode, CheckIn, CheckOut
            const headers = rows[0].map(h => String(h).toLowerCase());
            const codeIndex = headers.indexOf('employeecode');
            const checkInIndex = headers.indexOf('checkin');
            const checkOutIndex = headers.indexOf('checkout');

            if (codeIndex === -1 || checkInIndex === -1) {
                toast({ variant: 'destructive', title: 'ملف غير صالح', description: 'يجب أن يحتوي الملف على أعمدة EmployeeCode و CheckIn.' });
                return;
            }

            const updates: { [key: string]: any } = {};
            let successfulRecords = 0;

            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const employeeCode = row[codeIndex];
                const checkIn = row[checkInIndex];
                const checkOut = checkOutIndex !== -1 ? row[checkOutIndex] : null;

                if (!employeeCode || !checkIn) continue;
                
                try {
                    const checkInDate = new Date(checkIn as string);
                    const attendanceDate = checkInDate.toISOString().split('T')[0]; // YYYY-MM-DD
                    const attendanceId = `${employeeCode}_${attendanceDate}`;
                    const attendanceMonth = checkInDate.toISOString().substring(0, 7); // YYYY-MM

                    const newRecord: any = {
                        employeeId_date: attendanceId,
                        employeeId: String(employeeCode),
                        date: attendanceDate,
                        checkInTime: checkInDate.toISOString(),
                        status: 'present',
                        // These are defaults, they would be calculated by a proper function later
                        delayMinutes: 0, 
                        overtimeMinutes: 0,
                        earlyLeaveMinutes: 0,
                    };
                    
                    if (checkOut) {
                        newRecord.checkOutTime = new Date(checkOut as string).toISOString();
                    }
                    
                    const newRecordRef = ref(db, `attendance/${attendanceMonth}/${attendanceId}`);
                    updates[`/attendance/${attendanceMonth}/${attendanceId}`] = newRecord;

                    successfulRecords++;

                } catch(e) {
                     // Could log per-row errors if needed
                }
            }

            await update(ref(db), updates);

            toast({
                title: 'اكتمل الرفع',
                description: `تمت معالجة ورفع ${successfulRecords} سجل حضور بنجاح.`
            });

        } catch (error: any) {
            console.error(error);
            toast({
                variant: 'destructive',
                title: 'فشل في معالجة الملف',
                description: error.message || "الرجاء التأكد من أن الملف بصيغة Excel صحيحة."
            });
        } finally {
            setIsLoading(false);
            // Reset file input
            event.target.value = '';
        }
    };


    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-headline font-bold tracking-tight">
                رفع سجلات الحضور من ملف Excel
            </h2>

            <Card>
                <CardHeader>
                    <CardTitle>تحميل ملف الحضور</CardTitle>
                    <CardDescription>
                        اختر ملف Excel يحتوي على بيانات الحضور والانصراف للموظفين. يجب أن يحتوي الملف على أعمدة `EmployeeCode`, `CheckIn`, و `CheckOut` (اختياري).
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center gap-6 p-10 border-2 border-dashed rounded-lg">
                    <Upload className="w-12 h-12 text-muted-foreground" />
                    <p className="text-muted-foreground">اسحب الملف وأفلته هنا، أو انقر لاختياره</p>
                    <Button asChild>
                        <label htmlFor="file-upload">
                            {isLoading ? "جاري المعالجة..." : "اختيار ملف"}
                        </label>
                    </Button>
                    <Input id="file-upload" type="file" className="hidden" onChange={handleFileChange} accept=".xlsx, .xls" disabled={isLoading}/>
                    <p className="text-xs text-muted-foreground mt-4">الملفات المدعومة: .xlsx, .xls</p>
                </CardContent>
            </Card>
        </div>
    );
}
