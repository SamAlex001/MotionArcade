import MotionQuizStudioClient from './MotionQuizStudioClient';

export const metadata = {
  title: 'Motion Quiz Studio | Motion Arcade',
  description: 'Upload your custom questions via CSV/Excel or create them in-app, then play a touchless motion-controlled quiz!',
};

export default function MotionQuizStudioPage() {
  return (
    <div className="relative flex-1 bg-dots min-h-[calc(100vh-4rem)]">
      <MotionQuizStudioClient />
    </div>
  );
}
