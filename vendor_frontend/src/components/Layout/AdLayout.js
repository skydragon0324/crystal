import React from 'react';
import { Box, Flex, Grid, GridItem, Image, SimpleGrid, Text, useColorModeValue } from '@chakra-ui/react';
import Carousel from 'react-multi-carousel';
import { getFileUrl } from 'utils/utils';

const AdLayout = (props) => {
  const { predef_id, selected, disabled, onSelect, h, rows, autoplay } = props;

  const handleSelect = (preId) => {
    if (disabled || rows) {
      return;
    }
    onSelect && onSelect(preId);
  };

  const filterByPreIndex = (preIndex) => {
    return rows?.filter(row => row.pre_index === preIndex) || [];
  };

  const tableLayouts = {
    "t_1x1": { columns: 1, pre_indices: [1] },
    "t_1x2": { columns: 2, pre_indices: [1, 2] },
    "t_1x3": { columns: 3, pre_indices: [1, 2, 3] },
    "t_1x4": { columns: 4, pre_indices: [1, 2, 3, 4] },
    "t_1xn": { columns: 5, pre_indices: [1, 2, 3, "...", "n"] },
    "t_2x2": { columns: 2, pre_indices: [1, 2, 3, 4] },
    "t_2xn": { columns: 4, pre_indices: [1, 3, 5, "...", 2, 4, 8, "..."] },
  };

  const gridLayouts = {
    "g_2x2_21_11_11": {
      templateRows: "repeat(2, 1fr)",
      templateColumns: "repeat(2, 1fr)",
      gridItems: [
        { rowSpan: 2, colSpan: 1, pre_index: 1 },
        { rowSpan: 1, colSpan: 1, pre_index: 2 },
        { rowSpan: 1, colSpan: 1, pre_index: 3 },
      ],
    },
    "g_2x2_11_11_21": {
      templateRows: "repeat(2, 1fr)",
      templateColumns: "repeat(2, 1fr)",
      gridItems: [
        { rowSpan: 1, colSpan: 1, pre_index: 1 },
        { rowSpan: 2, colSpan: 1, pre_index: 3 },
        { rowSpan: 1, colSpan: 1, pre_index: 2 },
      ],
    },
    "g_2x3_21_12_12": {
      templateRows: "repeat(2, 1fr)",
      templateColumns: "repeat(3, 1fr)",
      gridItems: [
        { rowSpan: 2, colSpan: 1, pre_index: 1 },
        { rowSpan: 1, colSpan: 2, pre_index: 2 },
        { rowSpan: 1, colSpan: 2, pre_index: 3 },
      ],
    },
    "g_2x3_12_12_21": {
      templateRows: "repeat(2, 1fr)",
      templateColumns: "repeat(3, 1fr)",
      gridItems: [
        { rowSpan: 1, colSpan: 2, pre_index: 1 },
        { rowSpan: 2, colSpan: 1, pre_index: 3 },
        { rowSpan: 1, colSpan: 2, pre_index: 2 },
      ],
    },
    "g_2x3_21_12_11_11": {
      templateRows: "repeat(2, 1fr)",
      templateColumns: "repeat(3, 1fr)",
      gridItems: [
        { rowSpan: 2, colSpan: 1, pre_index: 1 },
        { rowSpan: 1, colSpan: 2, pre_index: 2 },
        { rowSpan: 1, colSpan: 1, pre_index: 3 },
        { rowSpan: 1, colSpan: 1, pre_index: 4 },
      ],
    },
    "g_2x3_22_11_11_21": {
      templateRows: "repeat(2, 1fr)",
      templateColumns: "repeat(3, 1fr)",
      gridItems: [
        { rowSpan: 1, colSpan: 2, pre_index: 1 },
        { rowSpan: 2, colSpan: 1, pre_index: 4 },
        { rowSpan: 1, colSpan: 1, pre_index: 2 },
        { rowSpan: 1, colSpan: 1, pre_index: 3 },
      ],
    },
    "g_2x3_21_11_11_12": {
      templateRows: "repeat(2, 1fr)",
      templateColumns: "repeat(3, 1fr)",
      gridItems: [
        { rowSpan: 2, colSpan: 1, pre_index: 1 },
        { rowSpan: 1, colSpan: 1, pre_index: 2 },
        { rowSpan: 1, colSpan: 1, pre_index: 3 },
        { rowSpan: 1, colSpan: 2, pre_index: 4 },
      ],
    },
    "g_2x3_11_11_12_21": {
      templateRows: "repeat(2, 1fr)",
      templateColumns: "repeat(3, 1fr)",
      gridItems: [
        { rowSpan: 1, colSpan: 1, pre_index: 1 },
        { rowSpan: 1, colSpan: 1, pre_index: 2 },
        { rowSpan: 2, colSpan: 1, pre_index: 4 },
        { rowSpan: 1, colSpan: 2, pre_index: 3 },
      ],
    },
  };

  if (tableLayouts[predef_id]) {
    const { columns, pre_indices } = tableLayouts[predef_id];
    return (
      <SimpleGrid columns={columns} spacing="4px" onClick={() => handleSelect(predef_id)}>
        {pre_indices.map((pre_index, idx) => (
          <AdItem key={idx} h={h} pre_index={pre_index} rows={filterByPreIndex(pre_index)} selected={selected} autoplay={autoplay} />
        ))}
      </SimpleGrid>
    );
  } else if (gridLayouts[predef_id]) {
    const { templateRows, templateColumns, gridItems } = gridLayouts[predef_id];
    return (
      <Grid templateRows={templateRows} templateColumns={templateColumns} gap="4px" onClick={() => handleSelect(predef_id)}>
        {gridItems.map((item, idx) => (
          <GridItem key={idx} rowSpan={item.rowSpan} colSpan={item.colSpan}>
            <AdItem h={h} pre_index={item.pre_index} rows={filterByPreIndex(item.pre_index)} selected={selected} autoplay={autoplay} />
          </GridItem>
        ))}
      </Grid>
    );
  }

  return (
    <></>
  );
}

const AdItem = (props) => {
  const { pre_index, rows, autoplay, selected, h } = props;
  const borderColor = useColorModeValue("var(--chakra-colors-gray-200)", "var(--chakra-colors-whiteAlpha-300)");
  const bgColor = useColorModeValue("var(--chakra-colors-gray-100)", "whiteAlpha.200");
  const selectedColor = useColorModeValue("blue.400", "blue.600");

  const responsive = {
    all: {
      breakpoint: { max: 5000, min: 0 },
      items: 1,
    },
  };

  return (
    <Flex h="100%" align="center" justify="center" border="1px solid" borderColor={borderColor} borderRadius="6px" bgColor={selected ? selectedColor : bgColor}>
      {!rows || rows.length === 0 ? (
        <Flex h={h} minH="24px" align="center" justify="center">
          <Text>{pre_index}</Text>
        </Flex>
      ) : rows.length === 1 ? (
        <Image src={getFileUrl(rows[0].image_url)} alt="" w="full" h="auto" objectFit="cover" />
      ) : (
        <Box w="full" h="full">
          <Carousel
            arrows={false}
            autoPlay={autoplay}
            centerMode={false}
            infinite={true}
            pauseOnHover={false}
            responsive={responsive}
            showDots={true}
          >
            {rows.map((row, index) => (
              <Flex key={`image-${index}`} w="full" h={h} justify="center">
                <Image src={getFileUrl(row.image_url)} alt="" w="auto" h="full" objectFit="cover" />
              </Flex>
            ))}
          </Carousel>
        </Box>
      )}
    </Flex>
  );
}

export default AdLayout;
