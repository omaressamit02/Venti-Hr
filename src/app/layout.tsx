
import type { Metadata } from 'next';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { FirebaseClientProvider } from '@/firebase';
import { Tajawal, Cairo } from 'next/font/google';
import { cn } from '@/lib/utils';

const tajawal = Tajawal({
  subsets: ['arabic'],
  weight: ['400', '500', '700'],
  variable: '--font-body',
});

const cairo = Cairo({
  subsets: ['arabic'],
  weight: ['700', '900'],
  variable: '--font-headline',
});

export const metadata: Metadata = {
  title: {
    default: 'CodeLink-HR',
    template: '%s | CodeLink-HR',
  },
  description: 'نظام الحضور والانصراف',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning className={cn(tajawal.variable, cairo.variable)}>
      <body className={cn("font-body antialiased")}>
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
        >
          <FirebaseClientProvider>
            {children}
          </FirebaseClientProvider>
            <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
