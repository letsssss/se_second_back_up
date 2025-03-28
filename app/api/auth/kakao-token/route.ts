import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateAccessToken, hashPassword } from '@/lib/auth';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const { supabaseUserId, email } = await req.json();

    if (!supabaseUserId || !email) {
      return NextResponse.json(
        { error: '필수 파라미터가 누락되었습니다.' },
        { 
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          }
        }
      );
    }

    // 1. 데이터베이스에서 사용자 조회
    let user = await prisma.user.findUnique({
      where: { email }
    });

    // 2. 사용자가 없으면 생성
    if (!user) {
      // 무작위 비밀번호 생성 (소셜 로그인 사용자는 이 비밀번호로 로그인하지 않음)
      const randomPassword = crypto.randomBytes(16).toString('hex');
      const hashedPassword = await hashPassword(randomPassword);
      
      // 소셜 로그인 사용자 정보 자동 생성
      user = await prisma.user.create({
        data: {
          email,
          name: email.split('@')[0], // 이메일에서 이름 추출
          password: hashedPassword, // 해시된 무작위 비밀번호
          role: 'USER'
        }
      });
      console.log('소셜 로그인 사용자 생성됨:', user.id);
    } else {
      console.log('기존 사용자 확인됨:', user.id);
    }

    // 3. JWT 토큰 생성 (supabaseUserId 정보도 추가)
    const token = generateAccessToken(user.id, user.email, user.role || 'USER');

    // 4. 쿠키 설정이 포함된 응답 객체 생성
    const response = NextResponse.json(
      { token, userId: user.id, success: true },
      { 
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
        }
      }
    );
    
    // 5. 쿠키에 토큰 저장 (CSRF 방지에 유용)
    // 보안 쿠키 (httpOnly)
    response.cookies.set({
      name: 'auth_token',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7일
      path: '/'
    });
    
    return response;
  } catch (error) {
    console.error('카카오 토큰 변환 오류:', error);
    return NextResponse.json(
      { 
        error: '토큰 생성 중 오류가 발생했습니다.', 
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined 
      },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      }
    );
  }
}

// OPTIONS 요청 처리 (CORS 프리플라이트 요청)
export async function OPTIONS(req: Request) {
  return NextResponse.json({}, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
} 