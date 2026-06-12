import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Shield, BookOpen, UserCircle, Briefcase, ChevronRight, Lock } from "lucide-react";

export function DarkPrestige() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-slate-300 font-sans overflow-y-auto selection:bg-amber-900 selection:text-amber-50">
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap');
        .font-serif { font-family: 'Cormorant Garamond', serif; }
        .font-sans { font-family: 'Inter', sans-serif; }
      `}} />

      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-md">
        <div className="container mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-sm bg-gradient-to-br from-amber-600 to-amber-900 flex items-center justify-center text-white font-serif font-bold text-xl tracking-wider">
              LP
            </div>
            <div className="flex flex-col">
              <span className="font-serif text-xl text-white font-semibold tracking-wide">LawPath SA</span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-amber-500/80 font-medium">AI Practice Platform</span>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <a href="#" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">Platform</a>
            <a href="#" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">Solutions</a>
            <a href="#" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">Security</a>
            <div className="w-px h-5 bg-white/10 mx-2"></div>
            <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-white/5">Sign In</Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white border-0 shadow-[0_0_15px_rgba(217,119,6,0.3)] transition-all">
              Start Firm Account
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 lg:pt-48 lg:pb-32 overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 z-0">
          <img 
            src="/__mockup/images/hero-dark-prestige.png" 
            alt="Luxury background" 
            className="w-full h-full object-cover opacity-40 mix-blend-luminosity"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-transparent to-[#0a0a0a]"></div>
        </div>

        <div className="container mx-auto px-6 relative z-10">
          <div className="grid lg:grid-cols-12 gap-16 items-center">
            
            {/* Left Copy */}
            <div className="lg:col-span-7 space-y-10">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                <span className="text-xs font-medium tracking-wide text-amber-500 uppercase">Enterprise-Grade Legal AI</span>
              </div>
              
              <h1 className="text-5xl lg:text-7xl font-serif text-white leading-[1.1] font-medium">
                Run your entire practice from <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-600">one tenant-safe</span> workspace.
              </h1>
              
              <p className="text-lg lg:text-xl text-slate-400 leading-relaxed max-w-2xl font-light">
                LawPath SA gives each firm its own secure company workspace while platform super admins manage shared AI, email infrastructure and model routing centrally.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Button size="lg" className="h-14 px-8 text-base bg-amber-600 hover:bg-amber-700 text-white rounded-sm shadow-[0_0_20px_rgba(217,119,6,0.2)]">
                  Start firm account
                  <ChevronRight className="ml-2 w-4 h-4" />
                </Button>
                <Button size="lg" variant="outline" className="h-14 px-8 text-base border-white/20 text-white hover:bg-white/5 rounded-sm bg-black/20 backdrop-blur-md">
                  <Lock className="mr-2 w-4 h-4 text-amber-500" />
                  Login to workspace
                </Button>
              </div>

              <div className="pt-12 border-t border-white/10 flex flex-wrap gap-6 items-center">
                <p className="text-sm text-slate-500 uppercase tracking-widest font-semibold w-full">Platform Guarantees</p>
                <div className="flex items-center gap-2 text-sm text-slate-300 bg-white/5 px-4 py-2 rounded-sm border border-white/5">
                  <Shield className="w-4 h-4 text-amber-600" />
                  Multi-tenant data isolation
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-300 bg-white/5 px-4 py-2 rounded-sm border border-white/5">
                  <Lock className="w-4 h-4 text-amber-600" />
                  Super-admin AI controls
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-300 bg-white/5 px-4 py-2 rounded-sm border border-white/5">
                  <UserCircle className="w-4 h-4 text-amber-600" />
                  Tenant-branded portal emails
                </div>
              </div>
            </div>

            {/* Right Auth Panel */}
            <div className="lg:col-span-5 relative">
              <div className="absolute -inset-0.5 bg-gradient-to-b from-amber-600/30 to-transparent rounded-lg blur opacity-50"></div>
              <Card className="relative bg-[#111] border-white/10 shadow-2xl rounded-lg overflow-hidden backdrop-blur-xl">
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-600 to-amber-400"></div>
                <CardHeader className="pt-8 pb-6 text-center border-b border-white/5">
                  <div className="w-12 h-12 mx-auto mb-4 rounded bg-[#1a1a1a] border border-white/10 flex items-center justify-center">
                    <Lock className="w-5 h-5 text-amber-500" />
                  </div>
                  <CardTitle className="font-serif text-3xl text-white">Partner Access</CardTitle>
                  <CardDescription className="text-slate-400">Secure entry to your firm's workspace</CardDescription>
                </CardHeader>
                <CardContent className="p-8">
                  <Tabs defaultValue="login" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-8 bg-[#1a1a1a] p-1 rounded border border-white/5">
                      <TabsTrigger value="login" className="data-[state=active]:bg-[#222] data-[state=active]:text-amber-500 rounded-sm">Sign In</TabsTrigger>
                      <TabsTrigger value="register" className="data-[state=active]:bg-[#222] data-[state=active]:text-amber-500 rounded-sm">New Firm</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="login" className="space-y-5">
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-slate-400 text-xs uppercase tracking-wider">Work Email</Label>
                        <Input id="email" type="email" placeholder="partner@firm.co.za" className="bg-[#1a1a1a] border-white/10 text-white h-12 focus-visible:ring-amber-500/50 rounded-sm" />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="password" className="text-slate-400 text-xs uppercase tracking-wider">Password</Label>
                          <a href="#" className="text-xs text-amber-600 hover:text-amber-500 transition-colors">Forgot?</a>
                        </div>
                        <Input id="password" type="password" className="bg-[#1a1a1a] border-white/10 text-white h-12 focus-visible:ring-amber-500/50 rounded-sm" />
                      </div>
                      <Button className="w-full h-12 bg-white text-black hover:bg-slate-200 font-semibold rounded-sm mt-4">
                        Authenticate
                      </Button>
                    </TabsContent>
                    
                    <TabsContent value="register" className="space-y-5">
                      <div className="space-y-2">
                        <Label htmlFor="firm" className="text-slate-400 text-xs uppercase tracking-wider">Firm Name</Label>
                        <Input id="firm" placeholder="e.g. Smith & Associates" className="bg-[#1a1a1a] border-white/10 text-white h-12 focus-visible:ring-amber-500/50 rounded-sm" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reg-email" className="text-slate-400 text-xs uppercase tracking-wider">Admin Email</Label>
                        <Input id="reg-email" type="email" className="bg-[#1a1a1a] border-white/10 text-white h-12 focus-visible:ring-amber-500/50 rounded-sm" />
                      </div>
                      <Button className="w-full h-12 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-sm mt-4">
                        Request Access
                      </Button>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>

          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 bg-[#050505] relative">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-3xl md:text-5xl font-serif text-white mb-6">Uncompromising Capabilities</h2>
            <div className="w-16 h-px bg-amber-600 mx-auto mb-6"></div>
            <p className="text-slate-400 text-lg font-light">Purpose-built infrastructure for modern South African law firms requiring both power and absolute confidentiality.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Feature 1 */}
            <div className="group p-8 rounded-sm bg-[#111] border border-white/5 hover:border-amber-500/30 transition-all duration-300 hover:bg-[#151515] hover:-translate-y-1 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <BookOpen className="w-24 h-24 text-white" />
              </div>
              <div className="w-12 h-12 rounded bg-[#1a1a1a] border border-white/10 flex items-center justify-center mb-6 text-amber-500 group-hover:scale-110 transition-transform">
                <BookOpen className="w-5 h-5" />
              </div>
              <h3 className="font-serif text-2xl text-white mb-3">Draft legal contracts</h3>
              <p className="text-slate-400 text-sm leading-relaxed">AI-assisted contract drafting specifically trained on SA legal precedents. Generate robust, compliant agreements in minutes, not hours.</p>
            </div>

            {/* Feature 2 */}
            <div className="group p-8 rounded-sm bg-[#111] border border-white/5 hover:border-amber-500/30 transition-all duration-300 hover:bg-[#151515] hover:-translate-y-1 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Shield className="w-24 h-24 text-white" />
              </div>
              <div className="w-12 h-12 rounded bg-[#1a1a1a] border border-white/10 flex items-center justify-center mb-6 text-amber-500 group-hover:scale-110 transition-transform">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="font-serif text-2xl text-white mb-3">Research at scale</h3>
              <p className="text-slate-400 text-sm leading-relaxed">Instantly search through thousands of case laws and statutes. Extract relevant arguments and synthesize findings securely.</p>
            </div>

            {/* Feature 3 */}
            <div className="group p-8 rounded-sm bg-[#111] border border-white/5 hover:border-amber-500/30 transition-all duration-300 hover:bg-[#151515] hover:-translate-y-1 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <UserCircle className="w-24 h-24 text-white" />
              </div>
              <div className="w-12 h-12 rounded bg-[#1a1a1a] border border-white/10 flex items-center justify-center mb-6 text-amber-500 group-hover:scale-110 transition-transform">
                <UserCircle className="w-5 h-5" />
              </div>
              <h3 className="font-serif text-2xl text-white mb-3">Client portals</h3>
              <p className="text-slate-400 text-sm leading-relaxed">Provide clients with a secure, firm-branded environment to review documents, sign agreements, and communicate directly.</p>
            </div>

            {/* Feature 4 */}
            <div className="group p-8 rounded-sm bg-[#111] border border-white/5 hover:border-amber-500/30 transition-all duration-300 hover:bg-[#151515] hover:-translate-y-1 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Briefcase className="w-24 h-24 text-white" />
              </div>
              <div className="w-12 h-12 rounded bg-[#1a1a1a] border border-white/10 flex items-center justify-center mb-6 text-amber-500 group-hover:scale-110 transition-transform">
                <Briefcase className="w-5 h-5" />
              </div>
              <h3 className="font-serif text-2xl text-white mb-3">Practice operations</h3>
              <p className="text-slate-400 text-sm leading-relaxed">Streamline conveyancing pipelines, automate billing, and track time effortlessly across your entire partnership.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer minimal */}
      <footer className="py-12 bg-[#050505] border-t border-white/5 text-center">
        <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-3 mb-4 md:mb-0">
            <span className="font-serif text-xl text-white font-semibold">LawPath SA</span>
            <span className="text-slate-600">|</span>
            <span className="text-sm text-slate-500">© {new Date().getFullYear()} All rights reserved.</span>
          </div>
          <div className="flex gap-6">
            <a href="#" className="text-sm text-slate-500 hover:text-white transition-colors">Privacy</a>
            <a href="#" className="text-sm text-slate-500 hover:text-white transition-colors">Terms</a>
            <a href="#" className="text-sm text-slate-500 hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
