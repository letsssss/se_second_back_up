import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifyToken } from '@/lib/auth';

const prisma = new PrismaClient();

// CORS 헤더 추가 함수
const addCorsHeaders = (response: NextResponse) => {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
};

// OPTIONS 요청 처리 (CORS preflight)
export async function OPTIONS() {
  return addCorsHeaders(
    NextResponse.json({}, { status: 200 })
  );
}

// 현재 로그인한 사용자 정보 가져오기
export async function GET(request: NextRequest) {
  console.log('현재 사용자 정보 요청 처리');
  
  try {
    // 요청 헤더에서 인증 토큰 추출
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return addCorsHeaders(
        NextResponse.json(
          { success: false, message: '인증 토큰이 제공되지 않았습니다.' },
          { status: 401 }
        )
      );
    }
    
    const token = authHeader.split(' ')[1];
    console.log('JWT 토큰 검증 시도', token.substring(0, 10) + '...');
    
    // JWT 토큰 검증
    const decoded = verifyToken(token);
    if (!decoded || !decoded.userId) {
      return addCorsHeaders(
        NextResponse.json(
          { success: false, message: '유효하지 않은 인증 토큰입니다.' },
          { status: 401 }
        )
      );
    }
    
    console.log('JWT 토큰 검증 성공', decoded);
    
    // 인증된 사용자 ID로 사용자 정보 조회
    const userId = decoded.userId;
    console.log('인증된 사용자 ID:', userId);
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        profileImage: true,
        createdAt: true,
        // 필요한 추가 정보
      },
    });
    
    if (!user) {
      return addCorsHeaders(
        NextResponse.json(
          { success: false, message: '사용자를 찾을 수 없습니다.' },
          { status: 404 }
        )
      );
    }
    
    // 사용자 정보 반환
    return addCorsHeaders(
      NextResponse.json(
        { 
          success: true, 
          user
        },
        { status: 200 }
      )
    );
    
  } catch (error: any) {
    console.error('사용자 정보 조회 오류:', error);
    
    return addCorsHeaders(
      NextResponse.json(
        { 
          success: false, 
          message: '사용자 정보를 가져오는 중 오류가 발생했습니다.',
          error: error.message
        },
        { status: 500 }
      )
    );
  }
} 