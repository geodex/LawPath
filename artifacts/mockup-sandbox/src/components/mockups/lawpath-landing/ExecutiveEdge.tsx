import React, { useState } from 'react';
import { ShieldCheck, Scale, Database, Server, ChevronRight, Lock, CheckCircle2, User, Key, Building2, Briefcase } from 'lucide-react';

export function ExecutiveEdge() {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('register');

  return (
    <div className="min-h-[100dvh] overflow-y-auto bg-[#030712] text-slate-300 font-sans selection:bg-slate-700">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap');
        
        .font-geometric {
          font-family: 'Plus Jakarta Sans', sans-serif;
        }
        
        .border-platinum {
          border-color: rgba(226, 232, 240, 0.2);
        }
        
        .bg-midnight-card {
          background: linear-gradient(145deg, #0f172a 0%, #080f1e 100%);
        }
        
        .bg-midnight-body {
          background: #030712;
        }

        .text-platinum {
          color: #f8fafc;
        }
        
        .gradient-text-silver {
          background: linear-gradient(to right, #ffffff, #94a3b8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
      `}</style>

      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-platinum bg-[#030712]/90 backdrop-blur-md">
        <div className="container mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 flex items-center justify-center bg-slate-800 border border-slate-600 text-platinum font-bold font-geometric tracking-wider rounded-sm">
              LP
            </div>
            <div className="flex flex-col">
              <span className="text-platinum font-geometric font-bold text-lg tracking-tight leading-none">LawPath SA</span>
              <span className="text-slate-500 text-xs font-medium tracking-widest uppercase mt-1">AI Practice Platform</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <button className="text-sm font-semibold tracking-wide text-slate-300 hover:text-white transition-colors">
              Login
            </button>
            <button className="text-sm font-bold tracking-wide bg-slate-100 text-[#0f172a] hover:bg-white px-6 py-2.5 transition-all shadow-[0_0_15px_rgba(255,255,255,0.1)]">
              Register Firm
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-24 pb-32 border-b border-platinum overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0 z-0 opacity-40 mix-blend-screen">
          <img 
            src="/__mockup/images/hero-executive-edge.png" 
            alt="Executive Background" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#030712] via-transparent to-[#030712]/80" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#030712] via-[#030712]/50 to-transparent" />
        </div>

        <div className="container relative z-10 mx-auto px-6">
          <div className="grid lg:grid-cols-12 gap-16 items-center">
            
            {/* Hero Content */}
            <div className="lg:col-span-7 flex flex-col gap-8">
              <div className="inline-flex items-center gap-2 border border-slate-700 bg-slate-900/50 px-3 py-1.5 w-fit rounded-sm">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                <span className="text-xs font-semibold tracking-widest uppercase text-slate-300">Enterprise Grade Infrastructure</span>
              </div>
              
              <h1 className="text-5xl lg:text-6xl font-geometric font-bold text-platinum leading-[1.1] tracking-tight">
                Run conveyancing, research, drafting, billing and client portals from <span className="gradient-text-silver">one tenant-safe workspace.</span>
              </h1>
              
              <p className="text-lg text-slate-400 leading-relaxed max-w-2xl font-light">
                LawPath SA gives each firm its own secure company workspace while platform super admins manage shared AI, email infrastructure and model routing centrally.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <button className="flex items-center justify-center gap-2 bg-slate-100 text-[#0f172a] px-8 py-4 font-bold tracking-wide hover:bg-white transition-all shadow-lg rounded-sm group">
                  Start firm account
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
                <button className="flex items-center justify-center gap-2 border border-slate-600 text-platinum bg-slate-900/40 hover:bg-slate-800/80 px-8 py-4 font-semibold tracking-wide transition-all rounded-sm">
                  <Lock className="w-4 h-4" />
                  Login to workspace
                </button>
              </div>

              <div className="grid sm:grid-cols-3 gap-6 pt-10 border-t border-platinum mt-6">
                {[
                  { icon: ShieldCheck, text: "Multi-tenant data isolation" },
                  { icon: Server, text: "Tenant-branded portal emails" },
                  { icon: Database, text: "Super-admin AI controls" }
                ].map((badge, i) => (
                  <div key={i} className="flex flex-col gap-3">
                    <badge.icon className="w-6 h-6 text-slate-400" strokeWidth={1.5} />
                    <span className="text-sm font-semibold text-slate-300 tracking-wide">{badge.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Auth Panel */}
            <div className="lg:col-span-5 w-full max-w-md mx-auto lg:ml-auto">
              <div className="bg-midnight-card border border-slate-700 shadow-2xl relative">
                {/* Accent line */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-slate-300 to-slate-600"></div>
                
                <div className="p-8">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-6 mb-8">
                    <button 
                      onClick={() => setActiveTab('register')}
                      className={`flex-1 pb-4 text-sm font-bold tracking-widest uppercase transition-colors relative \${activeTab === 'register' ? 'text-platinum' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      Register Firm
                      {activeTab === 'register' && (
                        <div className="absolute bottom-[-25px] left-0 w-full h-[2px] bg-platinum"></div>
                      )}
                    </button>
                    <button 
                      onClick={() => setActiveTab('login')}
                      className={`flex-1 pb-4 text-sm font-bold tracking-widest uppercase transition-colors relative \${activeTab === 'login' ? 'text-platinum' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      Login
                      {activeTab === 'login' && (
                        <div className="absolute bottom-[-25px] left-0 w-full h-[2px] bg-platinum"></div>
                      )}
                    </button>
                  </div>

                  <form className="flex flex-col gap-5" onSubmit={(e) => e.preventDefault()}>
                    {activeTab === 'register' && (
                      <div className="space-y-2">
                        <label className="text-xs font-semibold tracking-widest uppercase text-slate-400">Firm Name</label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                          <input type="text" placeholder="e.g. Smith & Associates" className="w-full bg-[#030712] border border-slate-700 rounded-sm py-3 pl-10 pr-4 text-platinum placeholder:text-slate-600 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-all" />
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      <label className="text-xs font-semibold tracking-widest uppercase text-slate-400">Work Email</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input type="email" placeholder="attorney@firm.co.za" className="w-full bg-[#030712] border border-slate-700 rounded-sm py-3 pl-10 pr-4 text-platinum placeholder:text-slate-600 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-all" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold tracking-widest uppercase text-slate-400">Password</label>
                      <div className="relative">
                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input type="password" placeholder="••••••••" className="w-full bg-[#030712] border border-slate-700 rounded-sm py-3 pl-10 pr-4 text-platinum placeholder:text-slate-600 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-all" />
                      </div>
                    </div>

                    <button className="w-full bg-slate-100 text-[#0f172a] font-bold tracking-wide py-3.5 rounded-sm hover:bg-white transition-colors mt-4">
                      {activeTab === 'register' ? 'Create Workspace' : 'Access Workspace'}
                    </button>
                    
                    {activeTab === 'login' && (
                      <div className="text-center mt-2">
                        <a href="#" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Forgot your password?</a>
                      </div>
                    )}
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 bg-midnight-body">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-geometric font-bold text-platinum tracking-tight mb-4">Command your practice.</h2>
              <p className="text-slate-400 text-lg font-light leading-relaxed">
                A unified architecture designed specifically for the rigorous demands of South African legal workflows.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                title: "Draft legal contracts",
                description: "AI-assisted generation of precise contracts, compliant with current local statutes, saving hours of manual drafting.",
                icon: Briefcase
              },
              {
                title: "Research at scale",
                description: "Query SAFLII and internal knowledge bases simultaneously. Pinpoint relevant case law with unprecedented speed.",
                icon: Scale
              },
              {
                title: "Client portals",
                description: "Secure, tenant-branded hubs for secure document exchange, status tracking, and automated client communication.",
                icon: ShieldCheck
              },
              {
                title: "Practice operations",
                description: "Centralized oversight for billing, FICA compliance, time-tracking, and robust multi-user permission controls.",
                icon: Server
              }
            ].map((feature, i) => (
              <div key={i} className="group relative bg-midnight-card border border-slate-800 hover:border-slate-500 p-8 transition-all duration-300 rounded-sm">
                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-slate-800/30 to-transparent pointer-events-none" />
                <feature.icon className="w-8 h-8 text-slate-400 mb-6 group-hover:text-platinum transition-colors" strokeWidth={1.5} />
                <h3 className="text-lg font-bold text-platinum font-geometric tracking-wide mb-3">{feature.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed font-light">{feature.description}</p>
                <div className="mt-8 pt-6 border-t border-slate-800/50 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 group-hover:text-slate-300 transition-colors">Explore module</span>
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 transition-colors" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-platinum py-12 bg-[#030712]">
        <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3 opacity-50">
            <div className="w-8 h-8 flex items-center justify-center bg-slate-800 border border-slate-600 text-platinum font-bold font-geometric tracking-widest text-xs rounded-sm">
              LP
            </div>
            <span className="text-sm font-bold font-geometric tracking-wide">LawPath SA</span>
          </div>
          <p className="text-sm text-slate-500">© 2024 LawPath SA. All rights reserved. Tier-1 Data Compliance.</p>
        </div>
      </footer>
    </div>
  );
}
