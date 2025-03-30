import { createClient, SupabaseClient } from '@supabase/supabase-js'

// 환경 변수에서 URL을 가져오도록 수정
const supabaseUrl = "https://jdubrjczdyqqtsppojgu.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkdWJyamN6ZHlxcXRzcHBvamd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMwNTE5NzcsImV4cCI6MjA1ODYyNzk3N30.rnmejhT40bzQ2sFl-XbBrme_eSLnxNBGe2SSt-R_3Ww";

// 브라우저 환경인지 확인 (디버깅 목적으로만 사용)
const isBrowser = () => typeof window !== 'undefined';

// 클라이언트를 생성하는 함수 (지연 초기화)
let supabaseInstance: SupabaseClient | null = null;

const getSupabase = (): SupabaseClient | null => {
  if (!supabaseInstance) {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Supabase URL과 Anon Key가 설정되어 있지 않습니다. 환경 변수를 확인해주세요.');
      console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '설정됨' : '설정되지 않음');
      console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? '설정됨' : '설정되지 않음');
      return null;
    }
    
    try {
      console.log('Supabase 클라이언트 초기화 - 환경:', isBrowser() ? '브라우저' : '서버');
      supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
      
      // 초기화 검증
      if (!supabaseInstance || !supabaseInstance.auth) {
        console.error('Supabase 클라이언트 초기화에 실패했습니다');
        return null;
      }
      
      console.log('Supabase 클라이언트 초기화 성공');
    } catch (error) {
      console.error('Supabase 클라이언트 초기화 중 오류 발생:', error);
      return null;
    }
  }
  
  return supabaseInstance;
};

// 지연 초기화를 위한 프록시
export const supabase = new Proxy({} as SupabaseClient, {
  get: (target, prop: string | symbol) => {
    const client = getSupabase();
    if (!client) {
      console.error('Supabase 클라이언트를 초기화할 수 없습니다. prop:', String(prop));
      return () => Promise.reject(new Error('Supabase 클라이언트 초기화 실패'));
    }
    
    return client[prop as keyof SupabaseClient];
  }
}); 