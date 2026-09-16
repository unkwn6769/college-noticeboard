import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

const Home = lazy(() => import("./pages/Home"));
const Department = lazy(() => import("./pages/Department"));
const FileViewer = lazy(() => import("./pages/FileViewer"));
const SearchResults = lazy(() => import("./pages/SearchResults"));

const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminAccounts = lazy(() => import("./pages/admin/AdminAccounts"));
const AdminStorage = lazy(() => import("./pages/admin/AdminStorage"));
const AdminStorageFileTypes = lazy(() => import("./pages/admin/AdminStorageFileTypes"));
const AdminManagement = lazy(() => import("./pages/admin/AdminManagement"));
const AdminDriveFiles = lazy(() => import("./pages/admin/AdminDriveFiles"));
const AdminDriveFileSearch = lazy(() => import("./pages/admin/AdminDriveFileSearch"));
const AdminActivity = lazy(() => import("./pages/admin/AdminActivity"));
const AdminRecycleBin = lazy(() => import("./pages/admin/AdminRecycleBin"));
const AdminStorageHealth = lazy(() => import("./pages/admin/AdminStorageHealth"));
const AdminSourceRetention = lazy(() => import("./pages/admin/AdminSourceRetention"));

function RouteFallback() {
  return (
    <div className="min-h-screen grid place-items-center p-6 text-sm text-slate-500" role="status" aria-live="polite">
      Loading…
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>

        <Route
          path="/"
          element={<Home />}
        />

        <Route
          path="/search"
          element={<SearchResults />}
        />

        <Route
          path="/department/:slug"
          element={<Department />}
        />

        <Route
          path="/file/:slug"
          element={<FileViewer />}
        />

        <Route
          path="/admin/login"
          element={<AdminLogin />}
        />

        <Route
          path="/admin"
          element={<AdminDashboard />}
        />

        <Route
          path="/admin/accounts"
          element={<AdminAccounts />}
        />

        <Route
          path="/admin/storage"
          element={<AdminStorage />}
        />

        <Route
          path="/admin/storage/health"
          element={<AdminStorageHealth />}
        />

        <Route
          path="/admin/storage/file-types"
          element={<AdminStorageFileTypes />}
        />

        <Route
          path="/admin/accounts/:accountId/files"
          element={<AdminDriveFiles />}
        />

        <Route
          path="/admin/file-search"
          element={<AdminDriveFileSearch />}
        />

        <Route
          path="/admin/admins"
          element={<AdminManagement />}
        />

        <Route
          path="/admin/activity"
          element={<AdminActivity />}
        />

        <Route
          path="/admin/recycle-bin"
          element={<AdminRecycleBin />}
        />

        <Route
          path="/admin/source-retention"
          element={<AdminSourceRetention />}
        />

        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;