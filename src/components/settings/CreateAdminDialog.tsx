import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Mail, Key, Users, UserPlus, RefreshCw, Settings, AlertTriangle, CheckCircle } from 'lucide-react';
import { useAdminUserCreation } from '@/hooks/useAdminUserCreation';
import { useToast } from '@/hooks/use-toast';
interface CreateAdminDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}
export const CreateAdminDialog = ({
  open,
  onOpenChange,
  onSuccess
}: CreateAdminDialogProps) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('admin');
  const [username, setUsername] = useState('');
  const [immediatePassword, setImmediatePassword] = useState('');
  const [useImmediateAccess, setUseImmediateAccess] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [passwordTemplate, setPasswordTemplate] = useState('secure_random');
  const [useAutoUsername, setUseAutoUsername] = useState(true);
  const [usernameFormat, setUsernameFormat] = useState<'full' | 'initials' | 'firstname'>('full');
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(true);
  
  // Validation states
  const [emailValidation, setEmailValidation] = useState<{ valid: boolean; errors: string[]; warnings: string[] } | null>(null);
  const [passwordValidation, setPasswordValidation] = useState<{ valid: boolean; errors: string[]; warnings: string[] } | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const { toast } = useToast();
  const {
    createAdminUser,
    generateSecurePassword,
    generateUsernameFromEmailAddr,
    generatePasswordWithTemplate,
    getPasswordTemplates,
    validateAdminData,
    validateAdminEmailOnly,
    validateAdminPasswordOnly,
    isCreating
  } = useAdminUserCreation();
  const passwordTemplates = getPasswordTemplates();

  // Real-time email validation
  useEffect(() => {
    if (email.trim()) {
      setIsValidating(true);
      const validation = validateAdminEmailOnly(email);
      setEmailValidation(validation);
      setIsValidating(false);
    } else {
      setEmailValidation(null);
    }
  }, [email, validateAdminEmailOnly]);

  // Real-time password validation
  useEffect(() => {
    if (useImmediateAccess && immediatePassword.trim()) {
      const validation = validateAdminPasswordOnly(immediatePassword, email);
      setPasswordValidation(validation);
    } else {
      setPasswordValidation(null);
    }
  }, [immediatePassword, email, useImmediateAccess, validateAdminPasswordOnly]);

  // Auto-generate username when email changes
  useEffect(() => {
    if (email && useAutoUsername) {
      const generatedUsername = generateUsernameFromEmailAddr(email, usernameFormat);
      setUsername(generatedUsername);
    }
  }, [email, useAutoUsername, usernameFormat, generateUsernameFromEmailAddr]);
  const handleGeneratePassword = () => {
    if (passwordTemplate === 'secure_random') {
      const newPassword = generateSecurePassword();
      setImmediatePassword(newPassword);
      setRequiresPasswordChange(false);
    } else {
      const {
        password,
        requiresChange
      } = generatePasswordWithTemplate(passwordTemplate, {
        email,
        username: username || generateUsernameFromEmailAddr(email, usernameFormat)
      });
      setImmediatePassword(password);
      setRequiresPasswordChange(requiresChange);
    }
  };
  const handleTemplateChange = (templateId: string) => {
    setPasswordTemplate(templateId);
    if (useImmediateAccess && email) {
      const {
        password,
        requiresChange
      } = generatePasswordWithTemplate(templateId, {
        email,
        username: username || generateUsernameFromEmailAddr(email, usernameFormat)
      });
      setImmediatePassword(password);
      setRequiresPasswordChange(requiresChange);
    }
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Comprehensive validation before submission
    const validationResult = validateAdminData({
      email: email.trim(),
      role,
      password: useImmediateAccess ? immediatePassword : undefined,
      username: username?.trim()
    });

    if (!validationResult.valid) {
      toast({
        title: 'Validation Failed',
        description: validationResult.errors.join('. '),
        variant: 'destructive'
      });
      return;
    }

    // Show warnings if any
    if (validationResult.warnings.length > 0) {
      toast({
        title: 'Security Warning',
        description: validationResult.warnings.join('. '),
        variant: 'destructive'
      });
    }
    
    const result = await createAdminUser({
      email: email.trim(),
      role: role as 'admin' | 'user',
      immediate_password: useImmediateAccess ? immediatePassword : undefined,
      username: username?.trim() || generateUsernameFromEmailAddr(email, usernameFormat),
      password_template: passwordTemplate,
      requires_password_change: requiresPasswordChange,
      send_email: sendEmail,
      admin_created: true
    });
    
    if (result.success) {
      // Show warnings from the creation process if any
      if (result.warnings && result.warnings.length > 0) {
        toast({
          title: 'Admin Created with Warnings',
          description: result.warnings.join('. '),
          variant: 'default'
        });
      }

      // Reset form and close dialog
      setEmail('');
      setRole('admin');
      setUsername('');
      setImmediatePassword('');
      setUseImmediateAccess(false);
      setSendEmail(true);
      setPasswordTemplate('secure_random');
      setUseAutoUsername(true);
      setUsernameFormat('full');
      setRequiresPasswordChange(true);
      setEmailValidation(null);
      setPasswordValidation(null);
      onOpenChange(false);
      onSuccess?.();
    }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b bg-muted/30">
          <DialogTitle className="flex items-center gap-3 text-lg font-semibold">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            Create Admin User
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-3">
                  <Label htmlFor="email" className="flex items-center gap-2 text-sm font-medium">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    Email Address
                  </Label>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="admin@example.com" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    className={`h-11 ${emailValidation?.valid === false ? 'border-red-500' : emailValidation?.valid === true ? 'border-green-500' : ''}`}
                    required 
                  />
                  
                  {/* Email validation feedback */}
                  {emailValidation && (
                    <div className="space-y-1">
                      {emailValidation.errors.length > 0 && (
                        <Alert className="border-red-200 bg-red-50">
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                          <AlertDescription className="text-red-800">
                            {emailValidation.errors.join('. ')}
                          </AlertDescription>
                        </Alert>
                      )}
                      {emailValidation.warnings.length > 0 && (
                        <Alert className="border-yellow-200 bg-yellow-50">
                          <AlertTriangle className="h-4 w-4 text-yellow-600" />
                          <AlertDescription className="text-yellow-800">
                            {emailValidation.warnings.join('. ')}
                          </AlertDescription>
                        </Alert>
                      )}
                      {emailValidation.valid && emailValidation.errors.length === 0 && (
                        <div className="flex items-center gap-1 text-green-600 text-sm">
                          <CheckCircle className="h-3 w-3" />
                          Valid email address
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="space-y-3">
                  <Label htmlFor="role" className="flex items-center gap-2 text-sm font-medium">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Role
                  </Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="user">User</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Username Configuration */}
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <UserPlus className="h-4 w-4 text-muted-foreground" />
                    Auto-generate Username
                  </Label>
                  <Switch checked={useAutoUsername} onCheckedChange={setUseAutoUsername} />
                </div>

                {useAutoUsername && (
                  <div className="space-y-3">
                    <Label htmlFor="username-format" className="text-sm font-medium">Username Format</Label>
                    <Select value={usernameFormat} onValueChange={(value: 'full' | 'initials' | 'firstname') => setUsernameFormat(value)}>
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">Full (john.doe)</SelectItem>
                        <SelectItem value="firstname">First Name (john)</SelectItem>
                        <SelectItem value="initials">Initials (jd)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {!useAutoUsername && (
                  <div className="space-y-3">
                    <Label htmlFor="username" className="text-sm font-medium">Custom Username</Label>
                    <Input 
                      id="username" 
                      type="text" 
                      placeholder="Enter username" 
                      value={username} 
                      onChange={e => setUsername(e.target.value)} 
                      className="h-11"
                    />
                  </div>
                )}

                {username && (
                  <div className="flex items-center gap-2 pt-2">
                    <Badge variant="outline" className="bg-background">
                      Username: {username}
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            <Separator className="my-6" />

            {/* Access Options */}
            <div className="space-y-6">
              <div className="p-4 bg-muted/30 rounded-lg space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <Label className="text-base font-medium">Immediate Access</Label>
                    <p className="text-sm text-muted-foreground">
                      Create user with password and auto-verify email for immediate login
                    </p>
                  </div>
                  <Switch checked={useImmediateAccess} onCheckedChange={setUseImmediateAccess} />
                </div>

                {useImmediateAccess && (
                  <div className="space-y-4 pt-4 border-t">
                    {/* Password Template Selection */}
                    <div className="space-y-3">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <Settings className="h-4 w-4 text-muted-foreground" />
                        Password Template
                      </Label>
                      <Select value={passwordTemplate} onValueChange={handleTemplateChange}>
                        <SelectTrigger className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {passwordTemplates.map(template => (
                            <SelectItem key={template.id} value={template.id}>
                              <div className="flex flex-col text-left">
                                <span className="font-medium">{template.name}</span>
                                <span className="text-xs text-muted-foreground">{template.description}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Password Input */}
                    <div className="space-y-3">
                      <Label htmlFor="password" className="flex items-center gap-2 text-sm font-medium">
                        <Key className="h-4 w-4 text-muted-foreground" />
                        Password
                      </Label>
                      <div className="flex gap-2">
                        <Input 
                          id="password" 
                          type="text" 
                          placeholder="Enter or generate password" 
                          value={immediatePassword} 
                          onChange={e => setImmediatePassword(e.target.value)} 
                          className={`font-mono h-11 flex-1 ${passwordValidation?.valid === false ? 'border-red-500' : passwordValidation?.valid === true ? 'border-green-500' : ''}`}
                        />
                        <Button type="button" variant="outline" onClick={handleGeneratePassword} className="h-11 px-3">
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      {/* Password validation feedback */}
                      {passwordValidation && (
                        <div className="space-y-1">
                          {passwordValidation.errors.length > 0 && (
                            <Alert className="border-red-200 bg-red-50">
                              <AlertTriangle className="h-4 w-4 text-red-600" />
                              <AlertDescription className="text-red-800 text-xs">
                                <ul className="list-disc list-inside space-y-1">
                                  {passwordValidation.errors.map((error, idx) => (
                                    <li key={idx}>{error}</li>
                                  ))}
                                </ul>
                              </AlertDescription>
                            </Alert>
                          )}
                          {passwordValidation.warnings.length > 0 && (
                            <Alert className="border-yellow-200 bg-yellow-50">
                              <AlertTriangle className="h-4 w-4 text-yellow-600" />
                              <AlertDescription className="text-yellow-800 text-xs">
                                <ul className="list-disc list-inside space-y-1">
                                  {passwordValidation.warnings.map((warning, idx) => (
                                    <li key={idx}>{warning}</li>
                                  ))}
                                </ul>
                              </AlertDescription>
                            </Alert>
                          )}
                          {passwordValidation.valid && passwordValidation.errors.length === 0 && (
                            <div className="flex items-center gap-1 text-green-600 text-xs">
                              <CheckCircle className="h-3 w-3" />
                              Password meets security requirements
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Password Change Requirement */}
                    <div className="flex items-start justify-between gap-4 pt-2">
                      <div className="space-y-1 flex-1">
                        <Label className="text-sm font-medium">Require Password Change</Label>
                        <p className="text-xs text-muted-foreground">
                          Force user to change password on first login
                        </p>
                      </div>
                      <Switch checked={requiresPasswordChange} onCheckedChange={setRequiresPasswordChange} />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 bg-muted/30 rounded-lg">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <Label className="text-base font-medium">Send Welcome Email</Label>
                    <p className="text-sm text-muted-foreground">
                      Send credentials and instructions via email
                    </p>
                  </div>
                  <Switch checked={sendEmail} onCheckedChange={setSendEmail} />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-muted/30 mt-auto">
            <div className="flex flex-col-reverse sm:flex-row gap-3 w-full">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)} 
                disabled={isCreating}
                className="flex-1 sm:flex-initial h-11"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={
                  !email?.trim() || 
                  !role || 
                  (useImmediateAccess && !immediatePassword?.trim()) || 
                  isCreating ||
                  (emailValidation && !emailValidation.valid) ||
                  (passwordValidation && !passwordValidation.valid)
                }
                className="flex-1 sm:flex-initial h-11 font-medium"
              >
                {isCreating ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Creating Admin...
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Create Admin User
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>;
};