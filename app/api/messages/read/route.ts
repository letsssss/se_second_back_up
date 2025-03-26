import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

// 메시지 읽음 상태 업데이트 API 핸들러
export async function POST(request: NextRequest) {
  try {
    // 1. 요청 본문 파싱
    const body = await request.json();
    const { roomId, userId } = body;
    
    // 2. 필수 필드 검증
    if (!roomId || !userId) {
      return NextResponse.json(
        { error: '필수 항목이 누락되었습니다 (roomId, userId 필수)' },
        { status: 400 }
      );
    }
    
    // 3. 인증 토큰 검증
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: '인증되지 않은 요청입니다.' },
        { status: 401 }
      );
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    
    if (!decoded || typeof decoded !== 'object' || !('userId' in decoded)) {
      return NextResponse.json(
        { error: '유효하지 않은 토큰입니다.' },
        { status: 401 }
      );
    }
    
    // 4. 토큰의 사용자 ID와 요청 본문의 사용자 ID가 일치하는지 확인
    const tokenUserId = parseInt(decoded.userId.toString());
    const requestUserId = parseInt(userId.toString());
    
    if (tokenUserId !== requestUserId) {
      return NextResponse.json(
        { error: '토큰의 사용자 ID와 요청한 사용자 ID가 일치하지 않습니다.' },
        { status: 403 }
      );
    }
    
    // 5. 읽지 않은 메시지 조회 및 업데이트
    const roomIdInt = parseInt(roomId);
    
    // 방 존재 여부 확인 및 사용자가 해당 방의 참여자인지 확인
    const isParticipant = await prisma.roomParticipant.findFirst({
      where: {
        roomId: roomIdInt,
        userId: requestUserId
      }
    });
    
    if (!isParticipant) {
      return NextResponse.json(
        { error: '해당 채팅방에 접근할 권한이 없습니다.' },
        { status: 403 }
      );
    }
    
    // 읽지 않은 메시지 업데이트
    const unreadMessages = await prisma.message.updateMany({
      where: {
        roomId: roomIdInt,
        receiverId: requestUserId,
        isRead: false
      },
      data: {
        isRead: true
      }
    });
    
    return NextResponse.json({
      success: true,
      updatedCount: unreadMessages.count,
      message: '메시지 읽음 상태가 업데이트되었습니다.'
    });
    
  } catch (error: any) {
    console.error('[API] 메시지 읽음 상태 업데이트 오류:', error);
    return NextResponse.json(
      { 
        error: '메시지 읽음 상태 업데이트 중 오류가 발생했습니다.',
        details: error.message
      },
      { status: 500 }
    );
  }
} 