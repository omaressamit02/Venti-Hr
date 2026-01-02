
'use client';
import React from 'react';
import AppLayout from '@/components/app-layout';


export default function Layout({ children }: { children: React.ReactNode }) {
  return (
      <AppLayout>
          {children}
      </AppLayout>
  );
}
