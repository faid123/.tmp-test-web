using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using System.Collections.Generic;

public class UI_RaycastTeeth : MonoBehaviour
{

	GraphicRaycaster m_Raycaster;
	PointerEventData m_PointerEventData;
	EventSystem m_EventSystem;

	bool hasClickedThisFrame = false;

	void Start()
	{
		//Fetch the Raycaster from the GameObject (the Canvas)
		m_Raycaster = GetComponent<GraphicRaycaster>();
		//Fetch the Event System from the Scene
		m_EventSystem = GetComponent<EventSystem>();
	}

	void Update()
	{
		if (hasClickedThisFrame)
			return;

		if (Solo2DManager.IsSolo2D)
		{
			if (Solo2DManager.Instance.SoloStage.curr2DStage == Solo2D_Progression.CurrentUI.Design)
				MouseClick();
		}

		else
			MouseClick();

		hasClickedThisFrame = false;

		//Check if the left Mouse button is clicked
		//if (Input.GetKey(KeyCode.Mouse0))
		//{

		//    //Set up the new Pointer Event
		//    m_PointerEventData = new PointerEventData(m_EventSystem);
		//    //Set the Pointer Event Position to that of the mouse position
		//    m_PointerEventData.position = Input.mousePosition;

		//    //Create a list of Raycast Results
		//    List<RaycastResult> results = new List<RaycastResult>();

		//    //Raycast using the Graphics Raycaster and mouse click position
		//    m_Raycaster.Raycast(m_PointerEventData, results);

		//    //For every result returned, output the name of the GameObject on the Canvas hit by the Ray
		//    foreach (RaycastResult result in results)
		//    {
		//        // filter to hit tooth object select
		//        if (result.gameObject.GetComponentInParent<GenericTooth>())
		//            result.gameObject.GetComponentInParent<GenericTooth>().OnPointerClickCustom();

		//        else if(result.gameObject.GetComponent<GenericTooth>())
		//                result.gameObject.GetComponent<GenericTooth>().OnPointerClickCustom();
		//    }


		//}
	}
	/// <summary>
	/// Private function to check if mouse click's raycast is hitting a tooth with the GenericTooth component
	/// </summary>
	void MouseClick()
	{
		//if (Input.GetKeyDown(KeyCode.Mouse0))
		if (!Input.GetMouseButtonUp(0))
			return;

		if (!RPDManager.instance.AllowTeethRaycast)
			return;

		if (hasClickedThisFrame)
			return;

		hasClickedThisFrame = true;

		//Set up the new Pointer Event
		m_PointerEventData = new PointerEventData(m_EventSystem);
		//Set the Pointer Event Position to that of the mouse position
		m_PointerEventData.position = Input.mousePosition;

		//Create a list of Raycast Results
		List<RaycastResult> results = new List<RaycastResult>();

		//Raycast using the Graphics Raycaster and mouse click position
		m_Raycaster.Raycast(m_PointerEventData, results);

		List<GenericTooth> raycastedThisFrame = new List<GenericTooth>();

		//For every result returned, output the name of the GameObject on the Canvas hit by the Ray
		foreach (RaycastResult result in results)
		{
			bool gotToothComponentFromParent = false;
			GenericTooth tooth = result.gameObject.GetComponent<GenericTooth>();

			if (tooth == null)
			{
				tooth = result.gameObject.GetComponentInParent<GenericTooth>();
				gotToothComponentFromParent = true;
			}

			if (tooth != null)
			{
				if (raycastedThisFrame.Contains(tooth))
					continue;

				Image image = null;

				// filter to hit tooth object select
				if (gotToothComponentFromParent)
					image = result.gameObject.transform.GetComponent<Image>();
				else
					image = result.gameObject.transform.GetComponentInChildren<Image>();

				if (image != null)
					image.alphaHitTestMinimumThreshold = 0.2f;

				tooth.OnPointerClickCustom();

				raycastedThisFrame.Add(tooth);
			}
		}

	}
}
