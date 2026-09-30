import { useToast } from '@chakra-ui/react';
import { getLangText } from 'lang/lang';

// Custom Toast Hook
const useCustomToast = () => {
  const toast = useToast(); // Chakra's useToast hook

  // Function to show a success toast
  const toastSuccess = (description) => {
    toast({
      // title: "Success",
      // description: description || "Operation successful",
      title: description || getLangText("TEXT_SUCCESS"),
      status: "success",
      position: "top",     // Default position is 'top'
      duration: 5000,      // Default duration is 5 seconds
      isClosable: true,    // Can be closed manually
    });
  };

  // Function to show an error toast
  const toastError = (description) => {
    toast({
      // title: "Error",
      // description: description || "Something went wrong",
      title: description || getLangText("TEXT_ERROR"),
      status: "error",
      position: "top",
      duration: 5000,
      isClosable: true,
    });
  };

  // Function to show a warning toast
  const toastWarning = (description) => {
    toast({
      // title: "Warning",
      // description: description || "There might be some issues",
      title: description || "There might be some issues",
      status: "warning",
      position: "top",
      duration: 5000,
      isClosable: true,
    });
  };

  // Return all toast functions
  return {
    toastSuccess,
    toastError,
    toastWarning,
  };
};

export default useCustomToast;
