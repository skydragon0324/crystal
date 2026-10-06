import React, { useState } from 'react';
import { Pagination as APagination, PaginationContainer, PaginationNext, PaginationPage, PaginationPageGroup, PaginationPrevious, PaginationSeparator, usePagination } from '@ajna/pagination';
import { Flex, IconButton, NumberInput, NumberInputField, Text, useColorModeValue } from '@chakra-ui/react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import SelectField from 'components/Select/SelectField';
import { getLangText } from 'lang/lang';

/** Page sizes offered in the footer dropdown. */
const PAGE_SIZES = [10, 25, 50, 100];

const Pagination = (props) => {
  const { count = 0, page, siblingCount = 1, onPageChange, onPageSizeChange, showGoto = false, showTotal = false } = props;
  const [pageInput, setPageInput] = useState(1);
  const { pages, pagesCount, currentPage, setCurrentPage, isDisabled, pageSize, setPageSize } = usePagination({
    total: count,
    limits: { outer: siblingCount, inner: siblingCount },
    initialState: { pageSize: props.pageSize, isDisabled: false, currentPage: page + 1 },
  });

  const textColor = useColorModeValue("secondaryGray.900", "white");
  const mutedColor = useColorModeValue("secondaryGray.700", "secondaryGray.500");
  const brandColor = useColorModeValue("brand.500", "brand.400");

  const handlePageChange = (nextPage) => {
    setCurrentPage(nextPage);
    setPageInput(nextPage);
    onPageChange(nextPage - 1);
  };

  const handleNavigate = (e) => {
    if (e.key === "Enter") {
      let value = +pageInput;
      if (value <= 0) {
        value = 1;
      } else if (value > pagesCount) {
        value = pagesCount;
      }
      setPageInput(value);
      handlePageChange(value);
    }
  };

  // SelectField hands back the raw option value, so this takes a number
  // rather than an event.
  const handlePageSizeChange = (value) => {
    const size = Number(value);
    setCurrentPage(1);
    setPageInput(1);
    setPageSize(size);
    onPageSizeChange(size);
  };

  if (count === 0) return null;

  return (
    <>
    {/* ---------- below md: compact pager ----------
        The full pager is display:none on mobile, which left phones with
        no way to reach page 2 at all. Icons only, so no new strings. */}
    <Flex
      display={{ base: "flex", md: "none" }}
      align="center"
      justify="space-between"
      py={3}
    >
      <IconButton
        aria-label="Previous page"
        size="sm"
        variant="outline"
        icon={<FiChevronLeft />}
        isDisabled={isDisabled || currentPage <= 1}
        onClick={() => handlePageChange(currentPage - 1)}
      />
      <Flex direction="column" align="center">
        <Text fontSize="sm" color={textColor}>{`${currentPage} / ${pagesCount}`}</Text>
        {showTotal && (
          <Text fontSize="xs" color={mutedColor}>
            {getLangText("TEXT_TOTAL_ROWS", [count])}
          </Text>
        )}
      </Flex>
      <IconButton
        aria-label="Next page"
        size="sm"
        variant="outline"
        icon={<FiChevronRight />}
        isDisabled={isDisabled || currentPage >= pagesCount}
        onClick={() => handlePageChange(currentPage + 1)}
      />
    </Flex>

    {/* ---------- md and up: original pager, unchanged ---------- */}
    <Flex align="center" justify="space-between" py={2} display={{ base: "none", md: "flex" }}>
      {showTotal && <Text fontSize="sm">{getLangText("TEXT_TOTAL_ROWS", [count])}</Text>}

      <Flex align="center" justify="end">
        <APagination
          pagesCount={pagesCount}
          currentPage={currentPage}
          isDisabled={isDisabled}
          onPageChange={handlePageChange}
        >
          <PaginationContainer align="center">
            <PaginationPrevious variant="ghost" display="inline-flex" minW="36px" h="36px" borderRadius="12px" p={0}>
              <FiChevronLeft fontSize="20px" />
            </PaginationPrevious>
            <PaginationPageGroup isInline align="center" separator={<PaginationSeparator variant="ghost" minW="36px" h="36px" borderRadius="12px" p={0} />}>
              {pages.map((page) => (
                <PaginationPage
                  key={`pagination_page_${page}`}
                  page={page}
                  // The current page is a filled brand chip in Horizon,
                  // not an outline - it has to read at a glance in a row
                  // of otherwise identical ghost buttons.
                  variant={page === currentPage ? "brand" : "ghost"}
                  minW="36px"
                  h="36px"
                  fontWeight={page === currentPage ? "700" : "medium"}
                  fontSize="sm"
                  color={page === currentPage ? "white" : textColor}
                  borderRadius="12px"
                  p={0}
                />
              ))}
            </PaginationPageGroup>
            <PaginationNext variant="ghost" display="inline-flex" minW="36px" h="36px" borderRadius="12px" p={0}>
              <FiChevronRight fontSize="20px" />
            </PaginationNext>
          </PaginationContainer>
        </APagination>

        {showGoto && (
          <Flex align="center" ml="24px">
            <Text whiteSpace="nowrap" fontSize="sm">{getLangText("TEXT_GOTO")}:</Text>
            <NumberInput ml="8px" w="80px" min={1} max={pagesCount} value={pageInput} onChange={setPageInput}>
              <NumberInputField h="36px" fontSize="sm" borderRadius="12px" boxShadow="none" _focus={{ boxShadow: "none", borderColor: brandColor }} color={textColor} aria-invalid="false" onKeyDown={handleNavigate} />
            </NumberInput>
          </Flex>
        )}

        {onPageSizeChange && (
          <SelectField
            size="sm"
            ml="12px"
            w="90px"
            options={PAGE_SIZES.map((n) => ({ value: n, label: String(n) }))}
            value={Number(pageSize)}
            isClearable={false}
            isSearchable={false}
            onChange={handlePageSizeChange}
          />
        )}
      </Flex>
    </Flex>
    </>
  );
};

export default Pagination;
