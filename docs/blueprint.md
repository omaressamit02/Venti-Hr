# **App Name**: CodeLink HR

## Core Features:

- Employee Management: HR/admins can create, manage, activate/deactivate employee profiles, set salaries, passwords, permissions, shift configuration (general or custom), and capture device ID at login.
- Attendance Monitoring: HR/admins can monitor daily attendance/leave records, filter by employee, date range, and DeviceID. Displays employee name, code, device ID, check-in/out times, delay minutes, and total delay minutes for the selected employee. Efficiently queries filtered attendance data.
- Monthly Payroll Calculation: Calculate salaries due for the selected month. Shows employee name, code, base salary, total delay minutes, deductions, and payable amount. Calculates totals based on attendance records and deduction rules. The system administrator publishes/pays the salaries.
- Deduction Rule Management: Manage dynamic rules for deduction calculation based on lateness. Rules are per day or month and deduct either minutes/hours from salary or fixed money amount. Defines global shift times, GPS coordinates for attendance, and QR code timeout.
- QR Code Generation and Display: Generate a secure, time-based QR code. The code updates every X seconds (configured in deduction settings). Only the latest QR code is valid for attendance. Uses a tool for date checking and server-side signature.
- QR Code Scanning and Attendance Recording: Scan QR codes to record attendance or checkout. Validates QR data against Realtime Database, checking for expiration, device location, and DeviceID. If valid, records attendance/checkout. Shows error messages if validation fails. Supports integrating device GPS and DeviceID during QR validation.
- Login System: Employee login with EmployeeCode + Password + optional DeviceID binding on first login. Uses hashing to store passwords securely. Applies roles or permission lists to show/hide screens per employee. Automatically capture employee’s DeviceID.

## Style Guidelines:

- Primary color: Deep, saturated blue (#1E3A8A) for professionalism and trustworthiness, suitable for an HR application.
- Background color: Light desaturated blue (#E0E7FF), providing a calm and professional feel, complementing the primary color.
- Accent color: Soft yellow (#FDE68A) to highlight important actions or information, contrasting well with the blue palette.
- Body font: 'PT Sans', a humanist sans-serif, offering a mix of modern and welcoming appeal.
- Headline font: 'Playfair', an elegant serif similar to Didot for titles to establish a fashionable, high-end feel; use 'PT Sans' for the body.
- Use clean and professional icons relevant to attendance, payroll, and employee management. Icons should support RTL layout for Arabic.
- Ensure a right-to-left (RTL) layout to accommodate the Arabic language. Align all text, icons, and UI elements accordingly.