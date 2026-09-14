import { Box, IconButton } from "@chakra-ui/react";
import React, { useEffect, useState } from "react";
import { FiArrowUp } from "react-icons/fi";

function ScrollTop() {
	const [showArrow, setShowArrow] = useState(false);

	useEffect(() => {
		const handleScroll = () => {
			if (window.scrollY > 100) setShowArrow(true);
			else setShowArrow(false);
		};

		window.addEventListener("scroll", handleScroll);

		return () => {
			window.removeEventListener("scroll", handleScroll);
		};
	}, []);

	const handleScrollTop = () => {
		window.scrollTo({ top: 0, behavior: "smooth" });
	};

	return (
		<Box
			position={"fixed"}
			bottom={10}
			left={"50%"}
			transform={`translate(${showArrow ? 100 : 0}, -50%)`}
			zIndex={100000}
			opacity={showArrow ? 1 : 0}
			transition={"all 0.3s linear"}
		>
			<IconButton
				onClick={handleScrollTop}
				boxShadow={"0 0 5px #555555ff"}
				bgColor={"gray.700"}
				color={"white"}
				_hover={{bgColor: "gray.900"}}
			>
				<FiArrowUp />
			</IconButton>
		</Box>
	);
}

export default ScrollTop;
