
'use client';
import React from 'react';
import AppLayout from '@/components/app-layout';
import { SidebarProvider } from '@/components/ui/sidebar';


export default function Layout({ children }: { children: React.ReactNode }) {
  return (
      <SidebarProvider>
        <AppLayout>
            {children}
        </AppLayout>
      </SidebarProvider>
  );
}
