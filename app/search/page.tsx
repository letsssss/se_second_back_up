"use client"

import { useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft } from "lucide-react"
import { useState, useEffect } from "react"

import { Button } from "@/components/ui/button"

// 서버로부터 받은 데이터 타입 정의
interface Post {
  id: number;
  title: string;
  content: string;
  eventName: string;
  eventDate: string;
  eventVenue: string;
  ticketPrice: number | string;
  createdAt: string;
  author: {
    id: string;
    name: string;
    email: string;
  };
}

// 가격을 숫자로 변환하는 함수
const getPriceNumber = (price: string | number) => {
  if (typeof price === 'number') return price;
  return Number.parseInt(price.replace(/[^0-9]/g, ""), 10)
}

export default function SearchResults() {
  const searchParams = useSearchParams()
  const query = searchParams?.get("query") || ""
  const [sortOrder, setSortOrder] = useState<"asc" | "desc" | null>(null)
  const [results, setResults] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const fetchSearchResults = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/posts?search=${encodeURIComponent(query)}`)
        const data = await response.json()
        
        if (data.success) {
          setResults(data.posts)
          console.log("검색 결과 로드 완료:", data.posts.length, "개 항목")
        } else {
          setError("검색 결과를 불러오는데 실패했습니다.")
        }
      } catch (err) {
        console.error("검색 결과 불러오기 오류:", err)
        setError("검색 결과를 불러오는데 실패했습니다.")
      } finally {
        setLoading(false)
      }
    }

    fetchSearchResults()
  }, [query])

  // 정렬 함수
  const sortedResults = [...results].sort((a, b) => {
    if (sortOrder === "asc") {
      return getPriceNumber(a.ticketPrice || 0) - getPriceNumber(b.ticketPrice || 0)
    } else if (sortOrder === "desc") {
      return getPriceNumber(b.ticketPrice || 0) - getPriceNumber(a.ticketPrice || 0)
    }
    return 0
  })

  // 로딩 상태 표시
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100">
        <header className="bg-white shadow">
          <div className="container mx-auto px-4 py-6">
            <Link href="/" className="flex items-center text-gray-600 hover:text-gray-900">
              <ArrowLeft className="h-5 w-5 mr-2" />
              <span>홈으로 돌아가기</span>
            </Link>
            <h1 className="text-3xl font-bold mt-4">검색 중...</h1>
            <p className="text-gray-600 mt-2">&quot;{query}&quot;에 대한 검색 결과를 불러오는 중입니다</p>
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="container mx-auto px-4 py-6">
          <Link href="/" className="flex items-center text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-5 w-5 mr-2" />
            <span>홈으로 돌아가기</span>
          </Link>
          <h1 className="text-3xl font-bold mt-4">검색 결과</h1>
          <p className="text-gray-600 mt-2">&quot;{query}&quot;에 대한 검색 결과</p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex gap-4 mb-6 overflow-x-auto pb-2">
          <Button variant="outline" className="rounded-full whitespace-nowrap">
            최신순
          </Button>
          <Button variant="outline" className="rounded-full whitespace-nowrap">
            인기순
          </Button>
          <Button
            variant={sortOrder === "asc" ? "confirm" : "outline"}
            className="rounded-full whitespace-nowrap"
            onClick={() => setSortOrder("asc")}
          >
            낮은가격순
          </Button>
          <Button
            variant={sortOrder === "desc" ? "confirm" : "outline"}
            className="rounded-full whitespace-nowrap"
            onClick={() => setSortOrder("desc")}
          >
            높은가격순
          </Button>
        </div>

        {error ? (
          <div className="text-center py-12">
            <p className="text-xl text-red-600">{error}</p>
            <p className="mt-2 text-gray-500">잠시 후 다시 시도해 주세요.</p>
          </div>
        ) : sortedResults.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {sortedResults.map((item) => (
              <Link href={`/ticket-cancellation/${item.id}`} key={item.id}>
                <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                  <Image
                    src={"/placeholder.svg"}
                    alt={item.title}
                    width={400}
                    height={200}
                    className="w-full h-48 object-cover"
                  />
                  <div className="p-4">
                    <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                    <p className="text-gray-600 mb-2">{item.eventName}</p>
                    <div className="flex justify-between items-center text-sm text-gray-500 mb-2">
                      <span>
                        {item.eventDate}
                      </span>
                      <span>{item.eventVenue}</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-500 mb-2">
                      <span>판매자:</span>
                      <span
                        onClick={(e) => {
                          e.preventDefault();
                          window.location.href = `/seller/${item.author.id}`;
                        }}
                        className="ml-1 text-blue-600 hover:underline flex items-center cursor-pointer"
                      >
                        {item.author.name}
                        <div className="flex items-center ml-2 text-yellow-500">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="mr-1"
                          >
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                          <span className="text-xs">4.5</span>
                        </div>
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-black">{Number(item.ticketPrice || 0).toLocaleString()}원</span>
                      <span className="px-2 py-1 rounded text-sm bg-green-100 text-green-600">
                        판매중
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-xl text-gray-600">검색 결과가 없습니다.</p>
            <p className="mt-2 text-gray-500">다른 검색어로 다시 시도해 보세요.</p>
          </div>
        )}
      </main>
    </div>
  )
}

