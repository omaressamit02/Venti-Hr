
'use client';
import React, { useState, useEffect } from 'react';
import Link from 'link/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  LogOut,
} from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
import { navItems } from '@/lib/nav-items';
import { useAuth, useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';

interface Settings {
    companyName?: string;
}

const useUserRole = () => {
    const [userProfile, setUserProfile] = useState<any>(null);
    const router = useRouter();

    useEffect(() => {
        const storedProfile = localStorage.getItem('userProfile');
        if (storedProfile && storedProfile.trim() !== '' && storedProfile !== 'undefined' && storedProfile !== 'null') {
            try {
                const parsed = JSON.parse(storedProfile);
                if (parsed && typeof parsed === 'object') {
                    setUserProfile(parsed);
                } else {
                    localStorage.removeItem('userProfile');
                    router.push('/');
                }
            } catch (e) {
                console.error("Error parsing user profile:", e);
                localStorage.removeItem('userProfile');
                router.push('/');
            }
        } else {
            router.push('/');
        }

    }, [router]);

    const userPermissions = userProfile?.permissions || [];
    
    return { userProfile, userPermissions };
};


export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const db = useDb();
  const { userProfile, userPermissions } = useUserRole();
  const [isClient, setIsClient] = useState(false);
  
  const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
  const [settings, isSettingsLoading] = useDbData<Settings>(settingsRef);
  
  const { isMobile, setOpenMobile } = useSidebar();

  useEffect(() => {
    if (!isSettingsLoading && settings?.companyName) {
        document.title = settings.companyName;
    }
  }, [isSettingsLoading, settings]);


  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleLogout = () => {
    if (auth?.currentUser) {
        auth.signOut();
    }
    localStorage.removeItem('userProfile');
    router.push('/');
  };

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const availableNavItems = isClient ? navItems.filter(item => {
    if (item.href === '/logout') return false; 

    if (userProfile?.employeeCode === 'admin' || userProfile?.id === 'superuser') return true;

    if (item.superAdminOnly) return false;
    
    if (item.adminOnly) {
        return userPermissions.some((p: string) => p.startsWith('/admin/'));
    }
    
    return userPermissions.includes(item.href);
  }) : [];


  const currentPage = isClient ? navItems.find((item) => pathname.startsWith(item.href)) : undefined;

  const canShowLogout = isClient && (userPermissions.includes('/logout') || userProfile?.id === 'superuser');

  return (
      <>
        <Sidebar side="right">
          <SidebarHeader>
            <div className="flex items-center gap-2 p-2">
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full" asChild>
                  <Link href="/home" onClick={handleLinkClick}>
                      <svg
                        role="img"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="text-sidebar-foreground"
                      >
                          <path
                              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.32 14.68c-.16.24-.46.32-.7.16l-3.2-2.13c-.24-.16-.32-.46-.16-.7s.46-.32.7-.16l3.2 2.13c.24.16.32.46.16.7zm-1.88-3.36c-.16.24-.46.32-.7.16l-4.16-2.77c-.24-.16-.32-.46-.16-.7s.46-.32.7-.16l4.16 2.77c.24.16.32.46.16.7zm-2.12-3.64c-.16.24-.46.32-.7.16L6.46 8.07c-.24-.16-.32-.46-.16-.7s.46-.32.7-.16l4.16 2.77c.24.16.32.46.16.7z"
                              fill="currentColor"
                          />
                      </svg>
                  </Link>
              </Button>
              {isSettingsLoading ? (
                  <Skeleton className="h-8 w-32" />
              ) : (
                  <h1 className="text-2xl font-headline text-sidebar-foreground">{settings?.companyName || ''}</h1>
              )}
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
              {availableNavItems.map((item) => (
                <SidebarMenuItem key={item.href} onClick={handleLinkClick}>
                  <SidebarMenuButton
                    asChild
                    isActive={isClient ? pathname.startsWith(item.href) : false}
                    tooltip={{ children: item.label, side: 'left' }}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter>
            {canShowLogout && (
              <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={handleLogout} tooltip={{ children: 'تسجيل الخروج', side: 'left' }}>
                        <LogOut />
                        <span>تسجيل الخروج</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
              </SidebarMenu>
            )}
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="flex items-center justify-between p-3 bg-card border-b sticky top-0 z-30">
              <div className='flex items-center gap-2'>
                  <SidebarTrigger className="md:hidden" />
                  <ThemeToggle />
              </div>
              <div className="flex items-center gap-4">
                 <h2 className="hidden md:block font-bold text-lg font-headline">
                  {isClient ? (currentPage?.label || 'الشاشة الرئيسية') : '...'}
                </h2>
                <SidebarTrigger className="hidden md:flex" />
              </div>
          </header>
          <main className="flex-1 p-4 md:p-6 lg:p-8 bg-background">
              {children}
          </main>
        </SidebarInset>
      </>
  );
}
