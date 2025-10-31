# MotionArcade 

An innovative AR-based gaming platform where your hands become the controller. MotionArcade leverages cutting-edge gesture recognition technology to create immersive, interactive gaming experiences that blend physical movement with digital gameplay.

![Next.js](https://img.shields.io/badge/Next.js-15.3.3-black)
![React](https://img.shields.io/badge/React-18.3.1-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![MediaPipe](https://img.shields.io/badge/MediaPipe-0.10.14-green)
![License](https://img.shields.io/badge/license-Private-red)

##  Features

- **Real-time Hand Tracking**: Powered by MediaPipe for accurate hand landmark detection
- **Gesture-Based Controls**: Natural hand gestures replace traditional controllers
- **AI-Powered Content**: Dynamic problem generation using Google Genkit AI
- **Responsive Design**: Play across all devices with a clean, modern UI
- **Multiple Game Modes**: 7 unique games testing different skills
- **Live Visual Feedback**: Immediate response to gestures and actions

##  Available Games

###  Math Challenge
Solve dynamic math problems using finger counting! Show the correct number of fingers (0-10) to answer arithmetic questions. Perfect for improving mental math while having fun.

###  Quiz Quest
Answer trivia questions by showing fingers corresponding to your answer choice. Hold your gesture to lock in your selection and test your knowledge across various topics.

###  Math Challenge 2
A physical twist on math! Pop floating bubbles containing correct answers using your hands. Combines body movement with mathematical problem-solving.

###  Sketch & Score
Draw shapes on screen using your index finger as a pencil. Switch between drawing and erasing with intuitive gestures. Tests creativity and precision.

###  Ping Pong
Classic single-player pong with a twist - control the paddle with your hand movements. Keep the ball in play and beat your high score.

###  Air Piano
Play a virtual piano by hitting falling notes with your fingers. A rhythm game that challenges timing, coordination, and musical ability.

###  Just Show Your Hands
A technical demonstration of the hand tracking engine. Explore different detection models and see real-time skeleton tracking visualization.

##  Getting Started

### Prerequisites

- Node.js 20.x or higher
- npm or yarn package manager
- A webcam for hand tracking
- Modern web browser (Chrome, Edge, or Firefox recommended)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/kravitexx/MotionArcade_test.git
   cd MotionArcade_test
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env.local` file in the root directory and add your configuration:
   ```env
   # Add your environment variables here
   GOOGLE_GENAI_API_KEY=your_api_key_here
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   
   Navigate to [http://localhost:9002](http://localhost:9002)

### AI Development (Optional)

To work with the Genkit AI flows:

```bash
# Start Genkit developer UI
npm run genkit:dev

# Or with auto-reload on changes
npm run genkit:watch
```

##  Tech Stack

### Frontend
- **Framework**: Next.js 15.3.3 with App Router
- **UI Library**: React 18.3.1
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS with custom theme
- **Components**: Radix UI primitives
- **Icons**: Lucide React

### Hand Tracking
- **MediaPipe Tasks Vision**: Real-time hand landmark detection
- **MediaPipe Drawing Utils**: Visual overlay rendering
- **Custom Hook**: `use-hand-tracking.ts` for gesture recognition

### AI Integration
- **Genkit**: AI workflow orchestration
- **Google Generative AI**: Dynamic content generation
- **Custom Flows**: Math problems, quiz questions, shape challenges

### Additional Tools
- **Form Handling**: React Hook Form with Zod validation
- **Date Utilities**: date-fns
- **Charts**: Recharts for data visualization
- **State Management**: React hooks and context

##  Project Structure

```
MotionArcade_test/
 src/
    app/                    # Next.js app router pages
       games/             # Individual game implementations
          math-challenge/
          quiz-quest/
          ping-pong/
          ...
       about/             # About page
       debug/             # Debug utilities
       layout.tsx         # Root layout
    components/            # Reusable components
       common/            # Shared components
       ui/                # UI primitives (shadcn/ui)
    hooks/                 # Custom React hooks
       use-hand-tracking.ts
    lib/                   # Utility functions
       finger-counting.ts
       utils.ts
    ai/                    # AI flows and configuration
        genkit.ts
        flows/             # AI generation flows
 public/                    # Static assets
 docs/                      # Documentation
 package.json               # Dependencies and scripts
```

##  Design System

### Color Palette
- **Primary**: Soft Lavender (#E6E6FA) - Calm, engaging atmosphere
- **Background**: Very Light Grey (#F5F5F5) - Clean, minimalist aesthetic
- **Accent**: Dusty Rose (#D8BFD8) - Interactive elements and feedback

### Typography
- **Headlines**: Space Grotesk (sans-serif) - Modern, bold
- **Body**: Inter (sans-serif) - Clean, highly readable

### UI Principles
- Geometric, clean icons with subtle animations
- Grid-based layout for game selection
- Smooth transitions for feedback
- Minimalist, clutter-free interface

##  Available Scripts

```bash
# Development
npm run dev              # Start Next.js dev server on port 9002
npm run genkit:dev       # Start Genkit developer UI
npm run genkit:watch     # Start Genkit with auto-reload

# Production
npm run build            # Build for production
npm start                # Start production server

# Code Quality
npm run lint             # Run ESLint
npm run typecheck        # TypeScript type checking
```

##  Contributing

This is a final year MCA project. Contributions, issues, and feature requests are welcome!

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

##  Troubleshooting

### Camera Access Issues
- Ensure your browser has permission to access the camera
- Use HTTPS or localhost (required for WebRTC)
- Check if another application is using the camera

### Hand Tracking Not Working
- Ensure proper lighting conditions
- Keep hands clearly visible in camera frame
- Try adjusting camera position and distance

### Performance Issues
- Close unnecessary browser tabs
- Use a modern browser (Chrome recommended)
- Ensure adequate system resources

##  License

This project is private and part of an academic final year project.

##  Author

**kravitexx**
- GitHub: [@kravitexx](https://github.com/kravitexx)

##  Acknowledgments

- MediaPipe team for hand tracking technology
- Google for Generative AI capabilities
- Vercel for Next.js framework
- shadcn/ui for beautiful component primitives
- The open-source community for amazing tools and libraries

##  Support

For questions or support, please open an issue in the GitHub repository.

---

**Built with  using Next.js, MediaPipe, and AI**

