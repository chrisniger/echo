'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken } from '@/lib/api';
import { Sidebar } from '@/components/Sidebar';
import { Upload, FileText, Trash2, Star } from 'lucide-react';

interface CvEntry {
  id: string;
  name: string;
  fileName: string;
  isDefault: boolean;
  tags: string[];
  createdAt: string;
}

export default function CvLibraryPage() {
  const router = useRouter();
  const [cvs, setCvs] = useState<CvEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    fetchCvs();
  }, []);

  const fetchCvs = async () => {
    try {
      setCvs(await api.get<CvEntry[]>('/api/cvs').catch(() => []));
    } catch {}
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/api/cvs/${id}`);
    setCvs((prev) => prev.filter((c) => c.id !== id));
  };

  if (loading)
    return (
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-8">Loading...</main>
      </div>
    );

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">CV Library</h1>
          <label className="flex items-center gap-2 px-4 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 cursor-pointer text-sm">
            <Upload className="w-4 h-4" /> Upload CV
            <input type="file" accept=".pdf,.docx" className="hidden" />
          </label>
        </div>
        {cvs.length === 0 ? (
          <div className="text-center py-16 text-zinc-500">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No CVs uploaded yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cvs.map((cv) => (
              <div
                key={cv.id}
                className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-echo-400" />
                    <div>
                      <p className="font-medium">{cv.name}</p>
                      <p className="text-xs text-zinc-500">{cv.fileName}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {cv.isDefault && <Star className="w-4 h-4 text-yellow-500" />}
                    <button
                      onClick={() => handleDelete(cv.id)}
                      className="text-zinc-500 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {cv.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {cv.tags.map((t, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 bg-zinc-800 rounded">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
