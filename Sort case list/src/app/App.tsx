import { useState, useRef } from 'react';
import { ArrowLeft, User, Lock, Smartphone } from 'lucide-react';

type AuthView = 'login' | 'otp';

const Logo = () => (
  <div className="relative w-24 h-24 mx-auto mb-6">
    <div className="absolute inset-0 bg-gradient-to-br from-teal-400 to-pink-300 rounded-3xl flex items-center justify-center">
      <div className="text-center">
        <div className="text-white text-2xl font-bold leading-tight">
          sm<span className="text-3xl">😊</span>RT
        </div>
        <div className="text-white text-xs font-semibold tracking-wider">RPO</div>
      </div>
    </div>
  </div>
);

const DotPattern = () => (
  <>
    <div className="absolute top-20 left-10 grid grid-cols-3 gap-3 opacity-30">
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
    </div>
    <div className="absolute bottom-20 left-10 grid grid-cols-3 gap-3 opacity-30">
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
    </div>
    <div className="absolute top-20 right-10 grid grid-cols-3 gap-3 opacity-30">
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
    </div>
    <div className="absolute bottom-32 right-20 grid grid-cols-3 gap-3 opacity-30">
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
      <div className="w-2 h-2 rounded-full bg-teal-400"></div>
    </div>
  </>
);

export default function App() {
  const [view, setView] = useState<AuthView>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpInputs = useRef<(HTMLInputElement | null)[]>([]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setView('otp');
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      value = value.slice(-1);
    }

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      otpInputs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputs.current[index - 1]?.focus();
    }
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('OTP submitted:', otp.join(''));
  };

  const handleResendOtp = () => {
    setOtp(['', '', '', '', '', '']);
    otpInputs.current[0]?.focus();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-teal-50 to-emerald-50 flex items-center justify-center p-4 relative overflow-hidden">
      <DotPattern />

      <div className="w-full max-w-md relative z-10">
        {view === 'login' ? (
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center mb-8">
              <Logo />
              <h1 className="text-3xl mb-2">Welcome Back</h1>
              <p className="text-gray-600">Sign in to continue to your account</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label htmlFor="username" className="block text-sm mb-2 text-gray-700">
                  Username
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm mb-2 text-gray-700">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="rounded border-gray-300" />
                  <span className="text-sm text-gray-600">Remember me</span>
                </label>
                <button type="button" className="text-sm text-teal-600 hover:text-teal-700">
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                className="w-full bg-teal-500 text-white py-3 rounded-lg hover:bg-teal-600 transition-colors"
              >
                Sign In
              </button>
            </form>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <button
              onClick={() => setView('login')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to login
            </button>

            <div className="text-center mb-8">
              <Logo />
              <h1 className="text-3xl mb-2">Enter OTP</h1>
              <p className="text-gray-600">
                We've sent a verification code to
                <br />
                <span className="font-medium text-gray-900">{username || 'your account'}</span>
              </p>
            </div>

            <form onSubmit={handleOtpSubmit} className="space-y-6">
              <div>
                <label className="block text-sm mb-3 text-gray-700 text-center">
                  Enter 6-digit code
                </label>
                <div className="flex gap-2 justify-center">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => (otpInputs.current[index] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      className="w-12 h-12 text-center border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-xl"
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-teal-500 text-white py-3 rounded-lg hover:bg-teal-600 transition-colors"
              >
                Verify OTP
              </button>

              <div className="text-center">
                <p className="text-sm text-gray-600">
                  Didn't receive the code?{' '}
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    className="text-teal-600 hover:text-teal-700"
                  >
                    Resend OTP
                  </button>
                </p>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
