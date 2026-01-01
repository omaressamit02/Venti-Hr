'use client';
import { format } from 'date-fns';

interface PayrollItem {
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    baseSalary: number;
    totalDelayMinutes: number;
    delayDeductions: number;
    totalEarlyLeaveMinutes: number;
    earlyLeaveDeductions: number;
    absenceDeductions: number;
    approvedLeaveDeductions: number;
    incompleteRecordDeductions: number;
    bonus: number;
    penalty: number;
    loanDeduction: number;
    salaryAdvanceDeductions: number;
    fixedDeductions: { name: string; amount: number }[];
    fixedAdditions: { name: string; amount: number }[];
    paid: boolean;
    locationName: string;
    appliedDelayRule?: string;
    appliedEarlyLeaveRule?: string;
}

interface PayslipProps {
    item: PayrollItem;
    month: string;
    payable: number;
    companyName?: string;
    formatCurrency: (amount: number) => string | number;
}

export function Payslip({ item, month, payable, companyName, formatCurrency }: PayslipProps) {
    
    const totalAdditions = item.bonus + item.fixedAdditions.reduce((acc, add) => acc + add.amount, 0);
    const totalDeductions = item.delayDeductions + item.earlyLeaveDeductions + item.absenceDeductions + item.approvedLeaveDeductions + item.incompleteRecordDeductions + item.penalty + item.loanDeduction + item.salaryAdvanceDeductions + item.fixedDeductions.reduce((acc, ded) => acc + ded.amount, 0);


    return (
        <div className="p-8 bg-white text-black font-sans text-sm" dir="rtl">
            <style>
                {`@media print {
                    @page { size: A4; margin: 0; }
                    body { -webkit-print-color-adjust: exact; margin: 0; }
                    .payslip-container {
                        margin: 0;
                        border: none;
                        width: 100%;
                        min-height: 100vh;
                    }
                }`}
            </style>
            <div className="payslip-container">
                <header className="flex justify-between items-center pb-4 border-b-2 border-gray-200">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">{companyName || "اسم الشركة"}</h1>
                        <p className="text-gray-500">كشف راتب</p>
                    </div>
                    <div className="text-left">
                        <p className="font-semibold">شهر: {format(new Date(month + '-02'), 'MMMM yyyy')}</p>
                        <p className="text-xs text-gray-500">تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</p>
                    </div>
                </header>

                <section className="my-6 p-4 bg-gray-50 rounded-lg">
                    <h2 className="text-lg font-bold mb-2">بيانات الموظف</h2>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                        <div><span className="font-semibold">اسم الموظف:</span> {item.employeeName}</div>
                        <div><span className="font-semibold">الكود الوظيفي:</span> {item.employeeCode}</div>
                    </div>
                </section>

                <section className="my-6">
                    <div className="grid grid-cols-2 gap-8">
                        {/* Earnings */}
                        <div>
                            <h2 className="text-lg font-bold mb-2 pb-1 border-b">الاستحقاقات</h2>
                            <div className="space-y-2">
                                <div className="flex justify-between"><span>الراتب الأساسي</span><span className="font-mono">{formatCurrency(item.baseSalary)}</span></div>
                                <div className="flex justify-between"><span>مكافآت</span><span className="font-mono">{formatCurrency(item.bonus)}</span></div>
                                {item.fixedAdditions.map(add => (
                                <div key={add.name} className="flex justify-between"><span>{add.name}</span><span className="font-mono">{formatCurrency(add.amount)}</span></div>
                                ))}
                            </div>
                            <div className="flex justify-between font-bold text-lg mt-4 pt-2 border-t">
                                <span>إجمالي الاستحقاقات</span>
                                <span className="font-mono">{formatCurrency(item.baseSalary + totalAdditions)}</span>
                            </div>
                        </div>

                        {/* Deductions */}
                        <div>
                            <h2 className="text-lg font-bold mb-2 pb-1 border-b">الاستقطاعات</h2>
                            <div className="space-y-2">
                                <div className="flex justify-between"><span>خصم التأخير</span><span className="font-mono">{formatCurrency(item.delayDeductions)}</span></div>
                                <div className="flex justify-between"><span>خصم انصراف مبكر</span><span className="font-mono">{formatCurrency(item.earlyLeaveDeductions)}</span></div>
                                <div className="flex justify-between"><span>خصم الغياب</span><span className="font-mono">{formatCurrency(item.absenceDeductions)}</span></div>
                                <div className="flex justify-between"><span>خصم عدم الانصراف</span><span className="font-mono">{formatCurrency(item.incompleteRecordDeductions)}</span></div>
                                <div className="flex justify-between"><span>جزاءات</span><span className="font-mono">{formatCurrency(item.penalty)}</span></div>
                                <div className="flex justify-between"><span>قسط السلفة</span><span className="font-mono">{formatCurrency(item.loanDeduction)}</span></div>
                                <div className="flex justify-between"><span>سلف جزئية</span><span className="font-mono">{formatCurrency(item.salaryAdvanceDeductions)}</span></div>
                                 {item.fixedDeductions.map(ded => (
                                <div key={ded.name} className="flex justify-between"><span>{ded.name}</span><span className="font-mono">{formatCurrency(ded.amount)}</span></div>
                                ))}
                            </div>
                             <div className="flex justify-between font-bold text-lg mt-4 pt-2 border-t">
                                <span>إجمالي الاستقطاعات</span>
                                <span className="font-mono">{formatCurrency(totalDeductions)}</span>
                            </div>
                        </div>
                    </div>
                </section>

                <footer className="mt-8 pt-4 border-t-2 border-gray-200">
                    <div className="flex justify-between items-center bg-gray-100 p-4 rounded-lg">
                        <span className="text-xl font-bold">صافي الراتب المستحق</span>
                        <span className="text-2xl font-bold font-mono text-green-700">{formatCurrency(payable)} ج.م</span>
                    </div>
                    <div className="mt-8 grid grid-cols-2 gap-8 text-center">
                        <div>
                            <p className="font-semibold">استلمت أنا /</p>
                            <p className="mt-12 border-b border-gray-400 border-dashed"> </p>
                            <p className="text-xs text-gray-500">توقيع الموظف</p>
                        </div>
                         <div>
                            <p className="font-semibold">يعتمد /</p>
                            <p className="mt-12 border-b border-gray-400 border-dashed"> </p>
                             <p className="text-xs text-gray-500">ختم وتوقيع المدير المسؤول</p>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
}
