import React, { useRef } from "react";
import "./AnimationScroll.css";

function Hover3D({ children }) {
  const hoverElement = useRef();

  const handleMouseMove = (e) => {
    const el = hoverElement.current.getBoundingClientRect();
    let mx = e.pageX - el.left - window.scrollX;
    let my = e.pageY - el.top - window.scrollY;

    // find the middle
    const middleX = el.width / 2;
    const middleY = el.height / 2;

    // get offset from middle as a percentage
    // and tone it down a little
    const offsetX = ((mx - middleX) / middleX) * 30;
    const offsetY = ((my - middleY) / middleY) * 30;

    // set rotation
    hoverElement.current.style.setProperty("--rotateX", offsetX + "deg");
    hoverElement.current.style.setProperty("--rotateY", -1 * offsetY + "deg");
  };

  const handleMouseOut=()=>{
    hoverElement.current.style.setProperty("--rotateX", "0deg");
    hoverElement.current.style.setProperty("--rotateY", "0deg");
  }

  return (
    <div
      // onMouseLeave={handleMouseOut}
      onMouseMove={handleMouseMove}
      className="image_3d_wrapper"
      tabIndex="0"
      ref={hoverElement}
    >
      {children}
    </div>
  );
}

export default Hover3D;
