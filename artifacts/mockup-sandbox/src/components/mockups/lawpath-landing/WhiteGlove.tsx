import React, { useState } from "react";
import { 
  Building2, 
  Scale, 
  Search, 
  FileText, 
  ShieldCheck, 
  Users,
  Briefcase,
  ChevronRight,
  Lock,
  Mail
} from "lucide-react";

export function WhiteGlove() {
  const [authTab, setAuthTab] = useState<"login" | "register">("register");

  return (
    <div className="w-full h-full overflow-y-auto bg-white text-[#0A1128] font-sans selection:bg-[#0A1128] selection:text-white pb-24">
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Outfit:wght@200;300;400;500;600&display=swap');
        
        .font-serif {
          font-family: 'Playfair Display', serif;
        }
        
        .font-sans {
          font-family: 'Outfit', sans-serif;
        }
        
        .gold-accent {
          color: #C5A059;
        }
        
        .bg-gold-accent {
          background-color: #C5A059;
        }
        
        .border-gold-accent {
          border-color: #C5A059;
        }
        
        .shadow-soft {
          box-shadow: 0 20px 40px -10px rgba(10, 17, 40, 0.05);
        }
      `}} />

      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 h-24 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#0A1128] text-white flex items-center justify-center font-serif text-lg tracking-widest">
              LP
            </div>
            <div>
              <h1 className="font-serif text-xl tracking-wide font-semibold text-[#0A1128] leading-none">
                LawPath SA
              </h1>
              <span className="text-xs uppercase tracking-widest text-gray-400 font-light mt-1 block">
                AI Practice Platform
              </span>
            </div>
          </div>

          <div className="flex items-center gap-6 text-sm">
            <button className="text-gray-500 hover:text-[#0A1128] uppercase tracking-wider font-medium transition-colors">
              Platform
            </button>
            <button className="text-gray-500 hover:text-[#0A1128] uppercase tracking-wider font-medium transition-colors">
              Solutions
            </button>
            <div className="w-[1px] h-4 bg-gray-200 mx-2"></div>
            <button className="text-[#0A1128] uppercase tracking-wider font-medium hover:gold-accent transition-colors">
              Login
            </button>
            <button className="bg-[#0A1128] text-white px-6 py-3 uppercase tracking-wider text-xs font-medium hover:bg-black transition-all">
              Start Firm Account
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative w-full min-h-[90vh] flex items-center pt-12 pb-24 px-6 overflow-hidden">
        {/* Abstract marble background element */}
        <div className="absolute top-0 right-0 w-1/2 h-full -z-10 opacity-30">
          <img 
            src="/__mockup/images/hero-white-glove.png" 
            alt="Marble Texture" 
            className="w-full h-full object-cover object-right mask-image-linear-left"
            style={{ WebkitMaskImage: 'linear-gradient(to right, transparent, black)' }}
          />
        </div>

        <div className="max-w-7xl mx-auto w-full grid lg:grid-cols-12 gap-16 items-center">
          
          {/* Left Content */}
          <div className="lg:col-span-7 space-y-12 relative z-10">
            <div className="inline-flex items-center gap-2 border border-gray-200 px-4 py-2 rounded-full bg-white/50 backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-gold-accent"></span>
              <span className="text-xs font-medium uppercase tracking-widest text-gray-500">Premium South African Legal SaaS</span>
            </div>
            
            <h2 className="font-serif text-5xl lg:text-7xl leading-[1.1] text-[#0A1128] font-medium tracking-tight">
              Run conveyancing, research, drafting, billing and client portals from one <span className="italic gold-accent font-light">tenant-safe</span> workspace.
            </h2>
            
            <p className="font-sans text-lg lg:text-xl text-gray-500 font-light leading-relaxed max-w-2xl">
              LawPath SA gives each firm its own secure company workspace while platform super admins manage shared AI, email infrastructure and model routing centrally.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center gap-6 pt-4">
              <button className="w-full sm:w-auto bg-[#0A1128] text-white px-10 py-5 uppercase tracking-wider text-sm font-medium hover:bg-black transition-all flex items-center justify-center gap-3 group">
                Start firm account
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <button className="w-full sm:w-auto text-[#0A1128] border border-[#0A1128] px-10 py-5 uppercase tracking-wider text-sm font-medium hover:bg-gray-50 transition-all">
                Login to workspace
              </button>
            </div>

            {/* Trust Badges */}
            <div className="pt-12 border-t border-gray-100 flex flex-wrap gap-8 items-center justify-start">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 gold-accent" strokeWidth={1.5} />
                <span className="text-xs uppercase tracking-widest text-gray-500 font-medium">Multi-tenant data isolation</span>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 gold-accent" strokeWidth={1.5} />
                <span className="text-xs uppercase tracking-widest text-gray-500 font-medium">Tenant-branded emails</span>
              </div>
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 gold-accent" strokeWidth={1.5} />
                <span className="text-xs uppercase tracking-widest text-gray-500 font-medium">Super-admin AI controls</span>
              </div>
            </div>
          </div>

          {/* Right Content (Auth Panel) */}
          <div className="lg:col-span-5 relative z-10">
            <div className="bg-white p-10 lg:p-14 shadow-soft border border-gray-100 relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-gold-accent"></div>
              
              <div className="mb-10 text-center">
                <div className="w-12 h-12 bg-gray-50 mx-auto flex items-center justify-center mb-6 border border-gray-100">
                  <Lock className="w-5 h-5 text-[#0A1128]" strokeWidth={1} />
                </div>
                <h3 className="font-serif text-2xl text-[#0A1128] mb-2">Concierge Access</h3>
                <p className="text-sm text-gray-400 font-light uppercase tracking-widest">Client & Partner Portal</p>
              </div>

              <div className="flex border-b border-gray-100 mb-8">
                <button 
                  onClick={() => setAuthTab("register")}
                  className={`flex-1 pb-4 text-xs uppercase tracking-widest font-medium transition-all relative \${authTab === 'register' ? 'text-[#0A1128]' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  Register
                  {authTab === "register" && <span className="absolute bottom-0 left-0 w-full h-[1px] bg-[#0A1128]"></span>}
                </button>
                <button 
                  onClick={() => setAuthTab("login")}
                  className={`flex-1 pb-4 text-xs uppercase tracking-widest font-medium transition-all relative \${authTab === 'login' ? 'text-[#0A1128]' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  Login
                  {authTab === "login" && <span className="absolute bottom-0 left-0 w-full h-[1px] bg-[#0A1128]"></span>}
                </button>
              </div>

              <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
                {authTab === "register" && (
                  <div className="space-y-6">
                    <div>
                      <label className="block text-xs uppercase tracking-widest text-gray-500 mb-2">Firm Name</label>
                      <input type="text" className="w-full border-b border-gray-200 py-3 text-[#0A1128] focus:border-[#0A1128] focus:outline-none transition-colors font-light bg-transparent rounded-none" placeholder="Enter your firm's name" />
                    </div>
                  </div>
                )}
                
                <div>
                  <label className="block text-xs uppercase tracking-widest text-gray-500 mb-2">Email Address</label>
                  <input type="email" className="w-full border-b border-gray-200 py-3 text-[#0A1128] focus:border-[#0A1128] focus:outline-none transition-colors font-light bg-transparent rounded-none" placeholder="partner@firm.co.za" />
                </div>
                
                <div>
                  <label className="block text-xs uppercase tracking-widest text-gray-500 mb-2">Password</label>
                  <input type="password" className="w-full border-b border-gray-200 py-3 text-[#0A1128] focus:border-[#0A1128] focus:outline-none transition-colors font-light bg-transparent rounded-none" placeholder="••••••••" />
                </div>

                <div className="pt-4">
                  <button className="w-full bg-[#0A1128] text-white py-4 uppercase tracking-widest text-xs font-medium hover:bg-black transition-all">
                    {authTab === "register" ? "Request Firm Access" : "Authenticate"}
                  </button>
                </div>
              </form>
            </div>
          </div>

        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-7xl mx-auto px-6 py-24 border-t border-gray-100">
        <div className="mb-20 text-center max-w-3xl mx-auto">
          <h2 className="text-xs uppercase tracking-widest text-gray-400 font-medium mb-6">Platform Capabilities</h2>
          <h3 className="font-serif text-4xl text-[#0A1128] mb-6">Precision engineered for the modern legal practice</h3>
          <p className="text-gray-500 font-light text-lg">Every tool your firm needs, unified under a single, highly-secure AI architecture.</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
          
          <div className="group">
            <div className="w-14 h-14 bg-gray-50 border border-gray-100 flex items-center justify-center mb-8 group-hover:border-gold-accent transition-colors">
              <FileText className="w-6 h-6 text-[#0A1128]" strokeWidth={1} />
            </div>
            <h4 className="font-serif text-2xl text-[#0A1128] mb-4">Draft legal contracts</h4>
            <p className="text-gray-500 font-light leading-relaxed">
              Generate bespoke legal documents instantly. Our AI models are trained on South African jurisprudence for absolute accuracy.
            </p>
          </div>

          <div className="group">
            <div className="w-14 h-14 bg-gray-50 border border-gray-100 flex items-center justify-center mb-8 group-hover:border-gold-accent transition-colors">
              <Search className="w-6 h-6 text-[#0A1128]" strokeWidth={1} />
            </div>
            <h4 className="font-serif text-2xl text-[#0A1128] mb-4">Research at scale</h4>
            <p className="text-gray-500 font-light leading-relaxed">
              Interrogate decades of case law, statutes, and precedents in seconds with context-aware semantic search capabilities.
            </p>
          </div>

          <div className="group">
            <div className="w-14 h-14 bg-gray-50 border border-gray-100 flex items-center justify-center mb-8 group-hover:border-gold-accent transition-colors">
              <Users className="w-6 h-6 text-[#0A1128]" strokeWidth={1} />
            </div>
            <h4 className="font-serif text-2xl text-[#0A1128] mb-4">Client portals</h4>
            <p className="text-gray-500 font-light leading-relaxed">
              Deploy branded, secure digital environments for clients to track matter progress, sign documents, and communicate safely.
            </p>
          </div>

          <div className="group">
            <div className="w-14 h-14 bg-gray-50 border border-gray-100 flex items-center justify-center mb-8 group-hover:border-gold-accent transition-colors">
              <Briefcase className="w-6 h-6 text-[#0A1128]" strokeWidth={1} />
            </div>
            <h4 className="font-serif text-2xl text-[#0A1128] mb-4">Practice operations</h4>
            <p className="text-gray-500 font-light leading-relaxed">
              Automate billing, trust account reconciliation, and FICA/KYC compliance within one unified dashboard.
            </p>
          </div>

        </div>
      </section>

      {/* Footer minimal */}
      <footer className="bg-[#0A1128] text-white py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 border border-white/20 flex items-center justify-center font-serif text-sm">
              LP
            </div>
            <span className="font-serif text-lg">LawPath SA</span>
          </div>
          <div className="text-xs uppercase tracking-widest text-white/50">
            © 2024 LawPath South Africa. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
