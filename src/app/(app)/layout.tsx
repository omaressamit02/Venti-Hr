
'use client';
import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/app-layout';
import { SidebarProvider } from '@/components/ui/sidebar';


export default function Layout({ children }: { children: React.ReactNode }) {
  return (
      <SidebarProvider defaultOpen={true}>
        <AppLayout>
            {children}
        </AppLayout>
      </SidebarProvider>
  );
}
