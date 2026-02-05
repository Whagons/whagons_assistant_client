import { useEffect, useRef } from "react";
import gsap from "gsap";

// Base values (viewBox coordinates)
const VIEWBOX_SIZE = 400;
const BASE_RADIUS = 120;
const BASE_STROKE_WIDTH = 18;

interface LoadingWidgetProps {
  /** Size of the widget in pixels (default: 400) */
  size?: number;
  /** Ring radius as percentage of size (default: 30, which is 120/400) */
  radiusRatio?: number;
  /** Stroke width as percentage of size (default: 4.5, which is 18/400) */
  strokeWidthRatio?: number;
  /** Ring color (default: "#ffffff") */
  color?: string;
  /** Animation cycle duration in seconds (default: 0.9) */
  cycleDuration?: number;
  /** Additional CSS class names */
  className?: string;
}

export function LoadingWidget({
  size = 400,
  radiusRatio = 30,
  strokeWidthRatio = 4.5,
  color = "#ffffff",
  cycleDuration = 0.9,
  className = "",
}: LoadingWidgetProps) {
  // Radius in viewBox coordinates
  const radius = (radiusRatio / 100) * VIEWBOX_SIZE;
  // Stroke width in screen pixels (for non-scaling-stroke)
  const strokeWidth = (strokeWidthRatio / 100) * size;
  const ring1Ref = useRef<SVGCircleElement>(null);
  const ring2Ref = useRef<SVGCircleElement>(null);
  const settingsRef = useRef({
    rotationXY: 0,
    zRotation: 0,
  });

  useEffect(() => {
    const ring1 = ring1Ref.current;
    const ring2 = ring2Ref.current;
    if (!ring1 || !ring2) return;

    const settings = settingsRef.current;

    function updateSvg() {
      if (!ring1 || !ring2) return;
      
      // Convert radians to degrees for SVG transforms
      const degZ = settings.zRotation * (180 / Math.PI);
      const scaleX = Math.cos(settings.rotationXY);

      // Ring 1: Apply rotation and then the perspective scale
      ring1.setAttribute("transform", `rotate(${degZ}) scale(${scaleX}, 1)`);

      // Ring 2: Apply rotation (+90deg offset) and then the perspective scale
      ring2.setAttribute("transform", `rotate(${degZ + 90}) scale(${scaleX}, 1)`);
    }

    // Initial render
    updateSvg();

    // Create animation timeline
    const tl = gsap.timeline({
      repeat: -1,
      onUpdate: updateSvg,
    });

    // Clockwise spin (Z-Axis)
    tl.to(
      settings,
      {
        zRotation: `+=${Math.PI / 2}`,
        duration: cycleDuration,
        ease: "none",
      },
      0
    );

    // Flatten pulse
    tl.to(
      settings,
      {
        rotationXY: Math.PI / 2,
        duration: cycleDuration / 2,
        ease: "power1.inOut",
      },
      0
    );

    tl.to(
      settings,
      {
        rotationXY: 0,
        duration: cycleDuration / 2,
        ease: "power1.inOut",
      },
      cycleDuration / 2
    );

    // Cleanup on unmount
    return () => {
      tl.kill();
    };
  }, [cycleDuration]);

  const center = VIEWBOX_SIZE / 2;

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
      className={className}
      style={{
        display: "block",
        width: size,
        height: size,
      }}
    >
      <g transform={`translate(${center}, ${center})`}>
        <circle
          ref={ring1Ref}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          ref={ring2Ref}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </svg>
  );
}

export default LoadingWidget;
