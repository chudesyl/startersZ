
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../integrations/supabase/client';
import { User, AuthState, LoginCredentials } from '../types/auth';
import logger from '../lib/logger';
import { useToast } from '@/hooks/use-toast';
import { handlePostLoginRedirect } from '@/utils/redirect';

interface CustomerAccount {
  id: string;
  user_id: string;
  name: string;
  phone?: string;
  email?: string;
  date_of_birth?: string;
}

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; redirect?: string; error?: string }>;
  signUp: (credentials: LoginCredentials & { name: string; phone?: string }) => Promise<{ success: boolean; requiresEmailVerification?: boolean; error?: string }>;
  signUpAdmin: (credentials: { email: string; password: string; name: string }) => Promise<{ success: boolean; requiresEmailVerification?: boolean; redirect?: string; error?: string }>;
  signUpWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendOtp: (email: string) => Promise<{ success: boolean; error?: string }>;
  session: Session | null;
  checkUser: () => Promise<void>;
  userType: 'admin' | 'customer' | null;
  customerAccount: CustomerAccount | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [customerAccount, setCustomerAccount] = useState<CustomerAccount | null>(null);
  const [userType, setUserType] = useState<'admin' | 'customer' | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    const initializeAuth = async () => {
      try {
        // Set up auth state listener with optimized handling
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (event, session) => {
            if (!mounted) return;
            
            // Only sync state updates here - no async operations
            setSession(session);
            
            if (session?.user) {
              // Defer async operations to prevent blocking
              setTimeout(() => {
                if (mounted) {
                  loadUserData(session.user).finally(() => {
                    if (mounted) setIsLoading(false);
                  });
                }
              }, 0);
            } else {
              setUser(null);
              setCustomerAccount(null);
              setUserType(null);
              setIsLoading(false);
            }
          }
        );

        unsubscribe = () => subscription?.unsubscribe();

        // Check for existing session with timeout
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Session check timeout')), 5000);
        });

        try {
          const { data: { session: initialSession } } = await Promise.race([
            sessionPromise,
            timeoutPromise
          ]) as any;
          
          if (!mounted) return;

          if (initialSession?.user) {
            setSession(initialSession);
            await loadUserData(initialSession.user);
          }
        } catch (timeoutError) {
          logger.warn('Session check timed out, proceeding without session');
        }
        
        if (mounted) {
          setIsLoading(false);
        }

      } catch (error: any) {
        logger.error('Auth initialization error:', error);
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const loadUserData = async (authUser: SupabaseUser) => {
    try {
      // Try to find existing profile with retry for newly created users
      let profile = null;
      let retries = 0;
      const maxRetries = 3;
      
      while (!profile && retries < maxRetries) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle();
        
        profile = data;
        
        if (!profile && retries < maxRetries - 1) {
          // Wait a bit before retrying for newly created users
          await new Promise(resolve => setTimeout(resolve, 500));
          retries++;
        } else {
          break;
        }
      }

      if (profile) {
        // Admin user found
        setUser({
          id: profile.id,
          name: profile.name || '',
          role: profile.role,
          avatar_url: profile.avatar_url,
          email: authUser.email || '',
        });
        setUserType('admin');
        setCustomerAccount(null);
        return;
      }

      // Check if user is customer (has customer account)
      const { data: customerAcc } = await supabase
        .from('customer_accounts')
        .select('*')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (customerAcc) {
        // Customer user
        setCustomerAccount(customerAcc);
        setUserType('customer');
        setUser(null);
        return;
      }

      // Check if this user was created by admin and should have a profile
      const isCreatedByAdmin = authUser.user_metadata?.created_by_admin || 
                               authUser.user_metadata?.role === 'admin' ||
                               authUser.user_metadata?.user_type === 'admin';
      
      // New user - determine type based on metadata or email
      const isAdminEmail = authUser.email === 'store@startersmallchops.com' || 
                          authUser.email?.includes('admin') || 
                          isCreatedByAdmin;
      
      if (isAdminEmail || isCreatedByAdmin) {
        // Create admin profile for users who should be admins
        const { data: newProfile, error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: authUser.id,
            name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Admin',
            email: authUser.email,
            role: authUser.user_metadata?.role || 'admin',
            is_active: true
          })
          .select()
          .single();

        if (newProfile && !profileError) {
          setUser({
            id: newProfile.id,
            name: newProfile.name,
            role: newProfile.role,
            avatar_url: newProfile.avatar_url,
            email: authUser.email || '',
          });
          setUserType('admin');
        } else {
          console.error('Failed to create admin profile:', profileError);
        }
      } else {
        // Create customer account with enhanced Google profile data
        const customerName = authUser.user_metadata?.full_name || 
                           authUser.user_metadata?.name || 
                           `${authUser.user_metadata?.first_name || ''} ${authUser.user_metadata?.last_name || ''}`.trim() ||
                           authUser.email?.split('@')[0] || 'Customer';
                           
        const { data: newCustomer } = await supabase
          .from('customer_accounts')
          .insert({
            user_id: authUser.id,
            name: customerName,
            phone: authUser.user_metadata?.phone,
            email: authUser.email
          })
          .select()
          .single();

        if (newCustomer) {
          setCustomerAccount(newCustomer);
          setUserType('customer');
        }
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const checkUser = async () => {
    setIsLoading(true);
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      setSession(currentSession);
      if (currentSession?.user) {
        await loadUserData(currentSession.user);
      } else {
        setUser(null);
        setCustomerAccount(null);
        setUserType(null);
      }
    } catch (error) {
      console.error('Error checking user:', error);
      setUser(null);
      setCustomerAccount(null);
      setUserType(null);
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async ({ email, password }: LoginCredentials) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) {
        console.error('Login error:', error);
        
        // Provide more helpful error messages for common issues
        let errorMessage = error.message;
        if (error.message.includes('Invalid login credentials')) {
          errorMessage = 'Invalid email or password. Please check your credentials and try again.';
        } else if (error.message.includes('Email not confirmed')) {
          errorMessage = 'Please verify your email address before logging in. Check your inbox for a verification email.';
        }
        
        toast({
          title: "Login failed",
          description: errorMessage,
          variant: "destructive",
        });
        return { success: false, error: errorMessage };
      }

      if (data.user) {
        // Load user data to determine correct redirect with retry logic
        await loadUserData(data.user);
        
        // Enhanced admin check with retry for newly created users
        let profile = null;
        let retries = 0;
        const maxRetries = 3;
        
        while (!profile && retries < maxRetries) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', data.user.id)
            .maybeSingle();
          
          profile = profileData;
          
          if (!profile && retries < maxRetries - 1) {
            // Wait a bit before retrying for newly created admin users
            await new Promise(resolve => setTimeout(resolve, 300));
            retries++;
          } else {
            break;
          }
        }
        
        // Check metadata if no profile found (for newly created admin users)
        const isAdminFromMetadata = data.user.user_metadata?.role === 'admin' ||
                                   data.user.user_metadata?.created_by_admin ||
                                   data.user.user_metadata?.user_type === 'admin';
        
        const redirectPath = (profile || isAdminFromMetadata) ? '/dashboard' : '/';
        return { success: true, redirect: redirectPath };
      }

      return { success: false, error: 'Login failed' };
    } catch (error: any) {
      console.error('Login error:', error);
      return { success: false, error: error.message };
    }
  };

  const signUp = async ({ email, password, name, phone }: LoginCredentials & { name: string; phone?: string }) => {
    try {
      const redirectUrl = `${window.location.origin}/auth-callback`;
      const userData: Record<string, any> = { 
        name, 
        full_name: name,
        user_type: 'customer'
      };
      
      if (phone && phone.trim()) {
        userData.phone = phone;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: userData,
        },
      });

      if (error) {
        console.error('Sign up error:', error);
        toast({
          title: "Registration failed",
          description: error.message,
          variant: "destructive",
        });
        return { success: false, error: error.message };
      }

      if (data.user && !data.user.email_confirmed_at) {
        toast({
          title: "Registration successful!",
          description: "Please check your email to verify your account.",
        });
        return { success: true, requiresEmailVerification: true };
      }

      return { success: true };
    } catch (error: any) {
      console.error('Sign up error:', error);
      return { success: false, error: error.message };
    }
  };

  const resendOtp = async (email: string) => {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth-callback`,
        }
      });

      if (error) {
        console.error('Resend OTP error:', error);
        toast({
          title: "Failed to resend email",
          description: error.message,
          variant: "destructive",
        });
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      console.error('Resend OTP error:', error);
      return { success: false, error: error.message };
    }
  };

  const signUpWithGoogle = async () => {
    try {
      const redirectUrl = `${window.location.origin}/auth-callback`;
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      });

      if (error) {
        throw error;
      }
    } catch (error: any) {
      console.error('Google sign up error:', error);
      toast({
        title: "Google sign up failed",
        description: error.message || "Please try again or use email registration.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const resetPassword = async (email: string) => {
    const send = () => supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/reset` });
    let { error } = await send();
    if (error) {
      const msg = String(error.message || '').toLowerCase();
      if (msg.includes('timeout') || msg.includes('context deadline exceeded') || msg.includes('504')) {
        await new Promise((r) => setTimeout(r, 1500));
        const retry = await send();
        if (!retry.error) return;
      }
      throw error;
    }
  };

  const signUpAdmin = async (credentials: { email: string; password: string; name: string }) => {
    try {
      const { email, password, name } = credentials;
      
      // Enhanced validation for admin signup
      if (!email || !password || !name) {
        const error = 'Email, password, and name are required for admin registration';
        toast({
          title: "Validation Error",
          description: error,
          variant: "destructive",
        });
        return { success: false, error };
      }

      // Email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        const error = 'Please enter a valid email address';
        toast({
          title: "Invalid Email",
          description: error,
          variant: "destructive",
        });
        return { success: false, error };
      }

      // Enhanced password validation for admin accounts
      if (password.length < 12) {
        const error = 'Admin password must be at least 12 characters long';
        toast({
          title: "Weak Password",
          description: error,
          variant: "destructive",
        });
        return { success: false, error };
      }

      // Check password complexity for admin accounts
      const hasUppercase = /[A-Z]/.test(password);
      const hasLowercase = /[a-z]/.test(password);
      const hasNumbers = /\d/.test(password);
      const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>_+=\-\[\]\\\/~`]/.test(password);

      if (!hasUppercase || !hasLowercase || !hasNumbers || !hasSpecialChars) {
        const error = 'Admin password must contain uppercase, lowercase, numbers, and special characters';
        toast({
          title: "Weak Password",
          description: error,
          variant: "destructive",
        });
        return { success: false, error };
      }

      // Check for common password patterns
      const commonPatterns = ['password', 'admin', 'root', '123456', 'qwerty'];
      const hasCommonPattern = commonPatterns.some(pattern => 
        password.toLowerCase().includes(pattern)
      );
      
      if (hasCommonPattern) {
        const error = 'Admin password cannot contain common patterns';
        toast({
          title: "Weak Password",
          description: error,
          variant: "destructive",
        });
        return { success: false, error };
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.toLowerCase().trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth-callback`,
          data: {
            user_type: 'admin',
            role: 'admin',
            name: name.trim(),
            full_name: name.trim(),
            admin_signup: true, // Flag to identify admin self-signup
            created_at: new Date().toISOString()
          },
        },
      });

      if (error) {
        console.error('Admin sign up error:', error);
        
        // Provide more specific error messages
        let errorMessage = error.message;
        if (error.message.includes('already registered')) {
          errorMessage = 'An admin account with this email already exists. Please use a different email or try logging in.';
        } else if (error.message.includes('invalid email')) {
          errorMessage = 'Please enter a valid email address.';
        }
        
        toast({
          title: "Admin registration failed",
          description: errorMessage,
          variant: "destructive",
        });
        return { success: false, error: errorMessage };
      }

      if (data.user && !data.user.email_confirmed_at) {
        toast({
          title: "Admin registration successful!",
          description: "Please check your email to verify your account before accessing the admin dashboard.",
        });
        return { success: true, requiresEmailVerification: true };
      }

      return { success: true, redirect: handlePostLoginRedirect('admin') };
    } catch (error: any) {
      console.error('Admin sign up error:', error);
      const errorMessage = 'An unexpected error occurred during admin registration. Please try again.';
      toast({
        title: "Registration Error",
        description: errorMessage,
        variant: "destructive",
      });
      return { success: false, error: errorMessage };
    }
  };

  const value = {
    session,
    user,
    customerAccount,
    userType,
    isAuthenticated: !!session?.user,
    isLoading,
    login,
    signUp,
    signUpAdmin,
    signUpWithGoogle,
    logout,
    resetPassword,
    resendOtp,
    checkUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
