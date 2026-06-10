using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class ComponentPlacer : MonoBehaviour
{
	[SerializeField]
	RPDComponent componentToPlace;

	[SerializeField]
	GenericTooth toothToPlaceOn;

	public void PlaceComponent()
	{
		UI_Component_Click.instance.SetCompType(componentToPlace);

		RPDManager.instance.PlaceComponent(UI_Component_Click.instance.currentComponent, toothToPlaceOn.ToothIndex, out CriteriaFailureData failureData);

		ConnectorsLogic.instance.ReSetMajorConnectors(toothToPlaceOn.ToothIndex, false);
	}
}
