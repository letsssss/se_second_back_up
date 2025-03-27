import { supabase } from './supabase';

// 게시글 목록 가져오기
export async function getPosts(options: {
  page?: number;
  limit?: number;
  category?: string;
  userId?: string;
  searchQuery?: string;
}) {
  try {
    const { page = 1, limit = 10, category, userId, searchQuery } = options;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('Post')
      .select('*, author:User(id, name, email)', { count: 'exact' })
      .eq('isDeleted', false)
      .order('createdAt', { ascending: false })
      .range(offset, offset + limit - 1);

    if (category) {
      query = query.eq('category', category);
    }

    if (userId) {
      query = query.eq('authorId', userId);
    }

    if (searchQuery) {
      query = query.or(`title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%`);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return {
      posts: data || [],
      totalCount: count || 0,
      page,
      limit,
    };
  } catch (error) {
    console.error('게시글 목록 조회 에러:', error);
    throw error;
  }
}

// 게시글 상세 조회
export async function getPostById(postId: string) {
  try {
    const { data, error } = await supabase
      .from('Post')
      .select('*, author:User(id, name, email)')
      .eq('id', postId)
      .eq('isDeleted', false)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('게시글 상세 조회 에러:', error);
    throw error;
  }
}

// 게시글 생성
export async function createPost(postData: {
  title: string;
  content: string;
  category: string;
  authorId: string;
  eventName?: string;
  eventDate?: string;
  eventVenue?: string;
  ticketPrice?: number;
  contactInfo?: string;
}) {
  try {
    const { data, error } = await supabase
      .from('Post')
      .insert([postData])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('게시글 생성 에러:', error);
    throw error;
  }
}

// 게시글 수정
export async function updatePost(postId: string, postData: {
  title?: string;
  content?: string;
  category?: string;
  eventName?: string;
  eventDate?: string;
  eventVenue?: string;
  ticketPrice?: number;
  contactInfo?: string;
  status?: string;
}) {
  try {
    const { data, error } = await supabase
      .from('Post')
      .update(postData)
      .eq('id', postId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('게시글 수정 에러:', error);
    throw error;
  }
}

// 게시글 삭제 (소프트 딜리트)
export async function deletePost(postId: string) {
  try {
    const { data, error } = await supabase
      .from('Post')
      .update({ isDeleted: true })
      .eq('id', postId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('게시글 삭제 에러:', error);
    throw error;
  }
}

// 구매 목록 조회
export async function getPurchases(userId: string, options: { page?: number; limit?: number; status?: string }) {
  try {
    const { page = 1, limit = 10, status } = options;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('Purchase')
      .select('*, post:Post(*), seller:User!Purchase_sellerId_fkey(*), buyer:User!Purchase_buyerId_fkey(*)', { count: 'exact' })
      .eq('buyerId', userId)
      .order('createdAt', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return {
      purchases: data || [],
      totalCount: count || 0,
      page,
      limit,
    };
  } catch (error) {
    console.error('구매 목록 조회 에러:', error);
    throw error;
  }
}

// 알림 목록 조회
export async function getNotifications(userId: string, options: { page?: number; limit?: number }) {
  try {
    const { page = 1, limit = 10 } = options;
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from('Notification')
      .select('*, post:Post(*)', { count: 'exact' })
      .eq('userId', userId)
      .order('createdAt', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return {
      notifications: data || [],
      totalCount: count || 0,
      page,
      limit,
    };
  } catch (error) {
    console.error('알림 목록 조회 에러:', error);
    throw error;
  }
} 