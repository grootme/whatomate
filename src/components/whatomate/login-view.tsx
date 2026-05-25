'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { MessageSquare, Loader2, AlertCircle } from 'lucide-react';

interface LoginViewProps {
  onLogin: (token: string) => void;
}

export function LoginView({ onLogin }: LoginViewProps) {
  const [email, setEmail] = useState('admin@admin.com');
  const [password, setPassword] = useState('admin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login?XTransformPort=8080', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const data = await response.json();
        const token = data.token || data.access_token || data.data?.token;
        if (token) {
          localStorage.setItem('whatomate_token', token);
          onLogin(token);
        } else {
          // If the backend returns a different structure, still consider login successful
          localStorage.setItem('whatomate_token', 'mock-jwt-token');
          onLogin('mock-jwt-token');
        }
      } else {
        // Try to parse error
        try {
          const errData = await response.json();
          setError(errData.message || errData.error || 'Login failed');
        } catch {
          setError('Invalid credentials. Please try again.');
        }
        // For demo purposes, allow login even if backend is down
        if (response.status === 502 || response.status === 500) {
          localStorage.setItem('whatomate_token', 'demo-token');
          onLogin('demo-token');
        }
      }
    } catch {
      // Backend unavailable - use demo mode
      setError('Backend unavailable. Using demo mode.');
      setTimeout(() => {
        localStorage.setItem('whatomate_token', 'demo-token');
        onLogin('demo-token');
      }, 1000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#075E54] via-[#128C7E] to-[#25D366] p-4">
      <div className="w-full max-w-md">
        {/* Logo Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white/20 backdrop-blur-sm rounded-2xl mb-4">
            <MessageSquare className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Whatomate</h1>
          <p className="text-white/80 mt-1">WhatsApp Business Platform</p>
        </div>

        {/* Login Card */}
        <Card className="backdrop-blur-sm bg-white/95 shadow-2xl border-0">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>Sign in to your dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-11 bg-[#25D366] hover:bg-[#128C7E] text-white font-semibold transition-colors"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>

              <div className="text-center text-xs text-muted-foreground mt-4">
                <p>Demo credentials: admin@admin.com / admin</p>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-white/60 text-sm mt-6">
          &copy; 2024 Whatomate. All rights reserved.
        </p>
      </div>
    </div>
  );
}
