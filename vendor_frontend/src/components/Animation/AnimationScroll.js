import React, { useCallback, useEffect, useRef, useState } from "react";
import "./AnimationScroll.scss";

function AnimationScroll({ children, type = "top", delay = 0, style }) {
  const ref = useRef();
  let scrollAnimation = "scrollSlideTop";
  switch (type) {
    case "top":
      scrollAnimation = "scrollSlideTop";
      break;
    case "left":
      scrollAnimation = "scrollSlideLeft";
      break;
    case "down":
      scrollAnimation = "scrollSlideDown";
      break;
    case "right":
      scrollAnimation = "scrollSlideRight";
      break;
    case "zoom":
      scrollAnimation = "scrollSlideZoom";
      break;
    case "flip":
      scrollAnimation = "scrollSlideFlip";
      break;
    default:
      scrollAnimation = "scrollSlideTop";
  }

  const [isScrollInEl, setIsScrollInEl] = useState(false);

  useEffect(() => {
    isInView();
  }, [])

  const isInView = useCallback(() => {
    const { top, height } = ref?.current?.getBoundingClientRect();

    if (
      top <= window.innerHeight - height * 0.5 &&
      top <= window.innerHeight * 0.9
    ) {
      if (!isScrollInEl) setIsScrollInEl(true);
      return;
    }
    if (isScrollInEl) setIsScrollInEl(false);
  }, [isScrollInEl]);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    window.addEventListener("scroll", isInView);
    return () => {
      window.removeEventListener("scroll", isInView);
    };
  }, [isInView]);

  return (
    <div
      ref={ref}
      className={`animateScroll ${scrollAnimation} ${isScrollInEl && "show"}`}
      style={{ transitionDelay: `${delay}s`, ...style }}
    >
      {children}
    </div>
  );
}

export default AnimationScroll;
