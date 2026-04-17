import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';

const Success = () => {
  const [searchParams] = useSearchParams();
  const paymentId = searchParams.get('payment_id');
  
  // Default to succeeded for local bypass testing
  const status = searchParams.get('status') || 'succeeded'; 
  
  // Evaluate the handshake outcome
  const isSuccess = status === 'succeeded';

  // Only start the countdown if it was a success
  const [countdown, setCountdown] = useState(isSuccess ? 10 : 0);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (paymentId) {
      navigator.clipboard.writeText(paymentId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Auto-redirect logic
  useEffect(() => {
    if (!isSuccess) return; // Halt timer on failure

    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    if (countdown === 0) {
      window.location.href = '/';
    }

    return () => clearInterval(timer);
  }, [countdown, isSuccess]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6 font-mono">
      <div className="max-w-md w-full border-2 border-zinc-900 bg-zinc-900/50 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        
        {/* DECORATIVE TERMINAL ELEMENTS */}
        <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent ${isSuccess ? 'via-red-800' : 'via-zinc-600'} to-transparent opacity-50`} />
        <div className="flex justify-between mb-8 opacity-30 text-[10px] uppercase tracking-[0.2em]">
          <span>{isSuccess ? 'Auth_Success' : 'Auth_Failed'}</span>
          <span>v1.1_Steel</span>
        </div>

        <div className="text-center">
          {/* DYNAMIC ICON */}
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full border mb-6 ${isSuccess ? 'bg-red-900/20 border-red-800/40 text-red-500' : 'bg-zinc-900/40 border-zinc-700/50 text-zinc-500'}`}>
            {isSuccess ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>

          <h1 className="text-3xl font-black uppercase tracking-tighter italic mb-2">
            Payment {isSuccess ? <span className="text-red-700">Verified.</span> : <span className="text-zinc-500">Declined.</span>}
          </h1>
          <p className="text-zinc-500 text-xs uppercase tracking-widest font-bold mb-8">
            {isSuccess ? 'Digital Supporter Key Activated' : 'Transaction Could Not Be Completed'}
          </p>

          <div className="space-y-4 mb-10 text-left">
            <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 shadow-inner group relative">
              <label className="block text-[9px] text-zinc-600 uppercase font-black tracking-widest mb-1">Transaction ID</label>
              <div className="flex items-center justify-between gap-4">
                <code className="text-[10px] text-zinc-400 break-all">
                  {paymentId || "LOCAL_BYPASS_MODE"}
                </code>
                <button 
                  onClick={handleCopy}
                  disabled={!paymentId}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all border ${
                    copied 
                      ? 'bg-red-900/20 text-red-500 border-red-900/50' 
                      : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300 hover:border-zinc-600'
                  }`}
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 shadow-inner">
              <label className="block text-[9px] text-zinc-600 uppercase font-black tracking-widest mb-1">Authorization Status</label>
              <code className={`text-[10px] font-bold uppercase ${isSuccess ? 'text-red-500' : 'text-zinc-500'}`}>
                {status}
              </code>
            </div>
          </div>

          <button 
            onClick={() => window.location.href = '/'}
            className={`w-full py-4 text-white rounded-xl font-black uppercase text-xs tracking-[0.2em] transition-all shadow-lg active:scale-95 ${
              isSuccess 
                ? 'bg-red-800 hover:bg-red-900 shadow-red-950/40' 
                : 'bg-zinc-800 hover:bg-zinc-700 shadow-zinc-950/40'
            }`}
          >
            {isSuccess ? `Return to Engine (${countdown}s)` : 'Return & Try Again'}
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-zinc-800/50 text-center">
          <p className="text-[9px] text-zinc-600 uppercase tracking-[0.3em]">
            {isSuccess ? 'Thank you for sustaining the project.' : 'No charges were applied to your account.'}
          </p>
        </div>
      </div>
      <Analytics />
    </div>
  );
};

export default Success;