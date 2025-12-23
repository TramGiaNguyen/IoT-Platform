// Page configuration for IoT Platform
// Add new pages here - they will automatically appear in permission management

export const PAGES = [
    { id: 'dashboard', label: 'Dashboard', path: '' },
    { id: 'rooms', label: 'Quản lý phòng', path: 'rooms' },
    { id: 'rules', label: 'Quản lý rule', path: 'rules' },
    { id: 'dashboards', label: 'Quản lý Dashboard', path: 'dashboards-manage' },
    { id: 'garden', label: 'Vườn thông minh', path: 'garden' },
    { id: 'classroom', label: 'Lớp học thông minh', path: 'classroom' },
];

// Pages only visible to admin (not shown in permission checkboxes)
export const ADMIN_ONLY_PAGES = ['users'];

// Check if user can access a page
export function canAccessPage(pageId, allowedPages, isAdmin) {
    if (isAdmin || (allowedPages && allowedPages.includes('*'))) {
        return true;
    }
    return allowedPages && allowedPages.includes(pageId);
}
