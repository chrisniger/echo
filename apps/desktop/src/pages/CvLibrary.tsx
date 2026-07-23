import { useEffect, useState } from 'react';
import { FileText, Star, Trash2, Eye, Tags, Calendar, AlertCircle } from 'lucide-react';
import { useCvStore } from '../stores/cv';
import { cn } from '../lib/utils';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Skeleton } from '../components/ui/skeleton';
import CvUploadZone from '../components/CvUploadZone';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function CvLibrary() {
  const { cvList, isLoading, fetchCvs, uploadCv, deleteCv, setDefaultCv, updateCv } = useCvStore();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailCvId, setDetailCvId] = useState<string | null>(null);
  const [deleteCvId, setDeleteCvId] = useState<string | null>(null);
  const [editTagsId, setEditTagsId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    fetchCvs();
  }, [fetchCvs]);

  const detailCv = cvList.find((cv) => cv.id === detailCvId) || null;
  const targetDeleteCv = cvList.find((cv) => cv.id === deleteCvId) || null;
  const editTagsCv = cvList.find((cv) => cv.id === editTagsId) || null;

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);
    const interval = setInterval(() => {
      setUploadProgress((prev) => Math.min(prev + 10, 90));
    }, 200);
    try {
      await uploadCv(file);
      clearInterval(interval);
      setUploadProgress(100);
      setTimeout(() => {
        setUploadOpen(false);
        setIsUploading(false);
        setUploadProgress(0);
      }, 500);
    } catch {
      clearInterval(interval);
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = async () => {
    if (deleteCvId) {
      await deleteCv(deleteCvId);
      setDeleteCvId(null);
    }
  };

  const handleAddTag = () => {
    if (editTagsCv && tagInput.trim()) {
      const newTags = [...(editTagsCv.tags || []), tagInput.trim()];
      updateCv(editTagsCv.id, { tags: newTags });
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    if (editTagsCv) {
      const newTags = (editTagsCv.tags || []).filter((t) => t !== tag);
      updateCv(editTagsCv.id, { tags: newTags });
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">CV Library</h1>
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <FileText className="h-4 w-4" />
              Upload CV
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload CV</DialogTitle>
              <DialogDescription>Upload a CV in PDF, DOCX, or DOC format</DialogDescription>
            </DialogHeader>
            <CvUploadZone
              onUpload={handleUpload}
              isUploading={isUploading}
              progress={uploadProgress}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && cvList.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton variant="rectangular" className="h-4 w-3/4 mb-3" />
                <Skeleton variant="text" className="h-3 w-1/2 mb-2" />
                <Skeleton variant="text" className="h-3 w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : cvList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <FileText className="mb-4 h-16 w-16 text-zinc-700" />
            <p className="text-lg text-zinc-500 dark:text-zinc-400">No CVs yet</p>
            <p className="mt-1 text-sm text-zinc-600">Upload your first CV to get started</p>
            <Button className="mt-4" onClick={() => setUploadOpen(true)}>
              Upload CV
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cvList.map((cv) => (
            <Card key={cv.id} className={cn(cv.isDefault && 'ring-1 ring-indigo-500')}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-5 w-5 shrink-0 text-indigo-500" />
                    <CardTitle className="text-base truncate">{cv.name}</CardTitle>
                  </div>
                  {cv.isDefault && (
                    <Badge variant="default" className="shrink-0">
                      Default
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="space-y-2 text-sm text-zinc-500 dark:text-zinc-400">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(cv.createdAt)}
                  </div>
                  <div className="flex items-center gap-2">
                    v{cv.version}
                    <span className="text-zinc-600">|</span>
                    {formatSize(cv.fileSize)}
                  </div>
                </div>
                {cv.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {cv.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
              <CardFooter className="gap-2 pt-0">
                <Button variant="ghost" size="sm" onClick={() => setDetailCvId(cv.id)}>
                  <Eye className="mr-1 h-3.5 w-3.5" />
                  View
                </Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={() => setEditTagsId(cv.id)}>
                      <Tags className="mr-1 h-3.5 w-3.5" />
                      Tags
                    </Button>
                  </DialogTrigger>
                </Dialog>
                {!cv.isDefault && (
                  <Button variant="ghost" size="sm" onClick={() => setDefaultCv(cv.id)}>
                    <Star className="mr-1 h-3.5 w-3.5" />
                    Set Default
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-red-400 hover:text-red-300"
                  onClick={() => setDeleteCvId(cv.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!detailCv} onOpenChange={(open) => !open && setDetailCvId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailCv?.name}</DialogTitle>
            <DialogDescription>
              Uploaded {detailCv ? formatDate(detailCv.createdAt) : ''} &middot; v
              {detailCv?.version}
            </DialogDescription>
          </DialogHeader>
          {detailCv && (
            <div className="space-y-4">
              <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-4">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  File Info
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                  <div>Name: {detailCv.name}</div>
                  <div>Size: {formatSize(detailCv.fileSize)}</div>
                  <div>Type: {detailCv.mimeType}</div>
                  <div>Default: {detailCv.isDefault ? 'Yes' : 'No'}</div>
                </div>
              </div>

              {detailCv.parsedText && (
                <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-4">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Parsed Content
                  </p>
                  <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap text-sm text-zinc-500 dark:text-zinc-400 font-sans">
                    {detailCv.parsedText}
                  </pre>
                </div>
              )}

              <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-4">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {detailCv.tags.length > 0 ? (
                    detailCv.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-zinc-500">No tags</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editTagsCv}
        onOpenChange={(open) => {
          if (!open) {
            setEditTagsId(null);
            setTagInput('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tags</DialogTitle>
            <DialogDescription>Manage tags for {editTagsCv?.name}</DialogDescription>
          </DialogHeader>
          {editTagsCv && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {(editTagsCv.tags || []).map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 rounded-full hover:bg-zinc-300 dark:hover:bg-zinc-700 p-0.5"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Add a tag..."
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                />
                <Button variant="secondary" onClick={handleAddTag}>
                  Add
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!targetDeleteCv} onOpenChange={(open) => !open && setDeleteCvId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete CV</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{targetDeleteCv?.name}"? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md bg-red-600/10 p-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This will permanently remove the CV and all its data.
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteCvId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
