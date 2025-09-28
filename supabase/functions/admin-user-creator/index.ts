import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateEmail, checkRateLimit, extractSecurityContext, logSecurityEvent } from '../_shared/security-utils.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Extract security context for rate limiting and logging
    const securityContext = extractSecurityContext(req)
    
    // Rate limiting for admin user creation
    const rateLimitResult = await checkRateLimit(supabase, {
      identifier: securityContext.user_id || securityContext.ip_address,
      max: 10, // Max 10 admin user creations per hour
      window: 3600, // 1 hour window
      action: 'admin_user_creation'
    })

    if (!rateLimitResult.allowed) {
      await logSecurityEvent(
        supabase,
        'admin_creation_rate_limit_exceeded',
        'medium',
        {
          action: 'admin_user_creation',
          rate_limit: rateLimitResult,
          attempted_by: securityContext.user_id
        },
        securityContext
      )
      
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Rate limit exceeded. Too many admin user creation requests.',
        retry_after: rateLimitResult.retry_after_seconds
      }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Authenticate admin user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing authorization' 
      }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    
    if (userError || !user) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Invalid authentication' 
      }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin' || !profile.is_active) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Access denied - admin privileges required' 
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Get request body
    const body = await req.json()
    console.log('[ADMIN-CREATOR] Creating admin user:', body.email)
    
    // Validate input
    if (!body.email || !body.role) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Email and role are required' 
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Enhanced email validation using security utils
    const emailValidation = validateEmail(body.email)
    if (!emailValidation.valid) {
      await logSecurityEvent(
        supabase,
        'admin_creation_invalid_email',
        'low',
        { 
          attempted_email: body.email?.substring(0, 3) + '***', // Partial logging for security
          validation_error: emailValidation.error
        },
        securityContext
      )
      
      return new Response(JSON.stringify({ 
        success: false, 
        code: 'INVALID_EMAIL',
        error: emailValidation.error 
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const sanitizedEmail = emailValidation.sanitized || body.email

    // Enhanced role validation
    const validRoles = ['admin', 'manager', 'staff', 'dispatch_rider']
    if (!validRoles.includes(body.role)) {
      return new Response(JSON.stringify({ 
        success: false, 
        code: 'INVALID_ROLE',
        error: `Invalid role. Must be one of: ${validRoles.join(', ')}` 
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Enhanced password validation for immediate access
    if (body.immediate_password) {
      if (body.immediate_password.length < 12) {
        return new Response(JSON.stringify({ 
          success: false, 
          code: 'WEAK_PASSWORD',
          error: 'Password must be at least 12 characters long for admin accounts' 
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Additional password complexity checks for admin accounts
      const hasUppercase = /[A-Z]/.test(body.immediate_password)
      const hasLowercase = /[a-z]/.test(body.immediate_password)
      const hasNumbers = /\d/.test(body.immediate_password)
      const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>_+=\-\[\]\\\/~`]/.test(body.immediate_password)

      if (!hasUppercase || !hasLowercase || !hasNumbers || !hasSpecialChars) {
        return new Response(JSON.stringify({ 
          success: false, 
          code: 'WEAK_PASSWORD',
          error: 'Password must contain uppercase, lowercase, numbers, and special characters' 
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Check for common password patterns
      const commonPatterns = ['password', 'admin', 'root', '123456', 'qwerty']
      const hasCommonPattern = commonPatterns.some(pattern => 
        body.immediate_password.toLowerCase().includes(pattern)
      )
      
      if (hasCommonPattern) {
        return new Response(JSON.stringify({ 
          success: false, 
          code: 'WEAK_PASSWORD',
          error: 'Password cannot contain common patterns' 
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }
    // Check if user already exists in auth and profiles
    try {
      const { data: existingUsers } = await supabase.auth.admin.listUsers()
      const userExists = existingUsers?.users?.find(u => 
        u.email?.toLowerCase() === sanitizedEmail
      )
      
      if (userExists) {
        console.log('[ADMIN-CREATOR] User already exists:', sanitizedEmail)
        
        await logSecurityEvent(
          supabase,
          'admin_creation_duplicate_attempt',
          'medium',
          { 
            attempted_email_domain: sanitizedEmail.split('@')[1],
            existing_user_id: userExists.id
          },
          securityContext
        )
        
        return new Response(JSON.stringify({ 
          success: false, 
          code: 'USER_EXISTS',
          error: 'A user with this email already exists' 
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Also check if profile already exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', sanitizedEmail)
        .maybeSingle()
      
      if (existingProfile) {
        console.log('[ADMIN-CREATOR] Profile already exists:', sanitizedEmail)
        return new Response(JSON.stringify({ 
          success: false, 
          code: 'USER_EXISTS',
          error: 'A user with this email already exists' 
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    } catch (listError) {
      console.warn('[ADMIN-CREATOR] Could not list users, proceeding with creation')
      
      // Log the warning but continue - don't block user creation due to listing issues
      await logSecurityEvent(
        supabase,
        'admin_creation_list_users_failed',
        'low',
        { error: listError.message },
        securityContext
      )
    }

    // Create user with enhanced data
    const createUserData = {
      email: sanitizedEmail,
      user_metadata: {
        role: body.role,
        created_by_admin: true,
        created_by_user_id: user.id,
        created_at: new Date().toISOString()
      }
    }

    if (body.immediate_password) {
      createUserData.password = body.immediate_password
      createUserData.email_confirm = true
    } else {
      createUserData.email_confirm = false
    }

    const { data: newUser, error: createError } = await supabase.auth.admin.createUser(createUserData)

    if (createError) {
      console.error('[ADMIN-CREATOR] User creation failed:', createError)
      
      // Log security event for failed user creation
      await logSecurityEvent(
        supabase,
        'admin_creation_failed',
        'high',
        { 
          error: createError.message,
          attempted_email_domain: sanitizedEmail.split('@')[1],
          role: body.role
        },
        securityContext
      )
      
      if (createError.message?.includes('already') || createError.message?.includes('exists')) {
        return new Response(JSON.stringify({ 
          success: false, 
          code: 'USER_EXISTS',
          error: 'A user with this email already exists' 
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Failed to create user. Please try again.' // Don't expose internal error details
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Create profile with upsert to handle edge cases
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: newUser.user.id,
        name: body.username || sanitizedEmail.split('@')[0],
        email: sanitizedEmail,
        role: body.role,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id',
        ignoreDuplicates: false
      })

    if (profileError) {
      console.error('[ADMIN-CREATOR] Profile creation failed:', profileError)
      
      // Check if it's a duplicate key error
      if (profileError.code === '23505') {
        console.log('[ADMIN-CREATOR] Profile already exists, cleaning up auth user')
        await supabase.auth.admin.deleteUser(newUser.user.id)
        
        return new Response(JSON.stringify({ 
          success: false, 
          code: 'USER_EXISTS',
          error: 'A user with this email already exists' 
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      
      // Cleanup user if profile creation fails for other reasons
      await supabase.auth.admin.deleteUser(newUser.user.id)
      
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Failed to create user profile: ${profileError.message}` 
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Enhanced audit logging with security context
    await supabase
      .from('audit_logs')
      .insert({
        action: 'admin_user_created',
        category: 'Admin Management',
        message: `Admin user created: ${sanitizedEmail}`,
        user_id: user.id,
        entity_id: newUser.user.id,
        new_values: {
          email_domain: sanitizedEmail.split('@')[1], // Log domain only for privacy
          role: body.role,
          created_by: user.id,
          immediate_access: !!body.immediate_password,
          ip_address: securityContext.ip_address,
          user_agent: securityContext.user_agent?.substring(0, 100) // Truncate for storage
        }
      })

    // Log successful creation for security monitoring
    await logSecurityEvent(
      supabase,
      'admin_user_created_successfully',
      'medium',
      { 
        new_user_id: newUser.user.id,
        role: body.role,
        created_by: user.id,
        email_domain: sanitizedEmail.split('@')[1]
      },
      securityContext
    )

    console.log('[ADMIN-CREATOR] User created successfully:', newUser.user.id)

    const responseData = {
      user_id: newUser.user.id,
      email: sanitizedEmail,
      role: body.role,
      immediate_access: !!body.immediate_password
    }

    if (body.immediate_password) {
      responseData.password = body.immediate_password
    }

    return new Response(JSON.stringify({
      success: true, 
      message: body.immediate_password 
        ? 'Admin user created with immediate access'
        : 'Admin user created successfully',
      data: responseData
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('[ADMIN-CREATOR] Unexpected error:', error)
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Internal server error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})